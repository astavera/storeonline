/** Database-backed Store Admin identity administration. */

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getPrismaClient } from "@/server/db/prisma";
import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { adminRoles, isAdminRole, type AdminRole } from "@/server/admin/identity/admin-rbac";

export type AdminUserSummary = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  mfaEnabled: boolean;
  locationScopeMode: "ALL" | "LOCATIONS";
  locations: { id: string; name: string }[];
  operationsRole: string | null;
  operationsLocationIds: string[];
  operationsLocations: { id: string; name: string }[];
  operationsAccessStatus: string;
  operationsLastSyncedAt: string | null;
  operationsSyncError: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AdminIdentityDirectory = {
  available: boolean;
  reason?: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE";
  users: AdminUserSummary[];
  locations: { id: string; name: string }[];
  roles: readonly AdminRole[];
};

export type InviteAdminUserInput = {
  email: string;
  displayName?: string;
  role: AdminRole;
  locationScopeMode: "ALL" | "LOCATIONS";
  locationIds: readonly string[];
  actorSubject: string;
};

export type AdminInvitationResult = {
  userId: string;
  email: string;
  activationPath: string;
  expiresAt: string;
};

const invitationLifetimeMs = 72 * 60 * 60 * 1_000;

export async function readAdminIdentityDirectory(): Promise<AdminIdentityDirectory> {
  if (!process.env.DATABASE_URL) {
    return { available: false, reason: "DATABASE_NOT_CONFIGURED", users: [], locations: [], roles: adminRoles };
  }

  try {
    const prisma = getPrismaClient();
    const [users, locations] = await Promise.all([
      prisma.adminUser.findMany({
        orderBy: [{ status: "asc" }, { email: "asc" }],
        include: { locationScopes: { include: { location: { select: { id: true, name: true } } } } }
      }),
      prisma.storeLocation.findMany({
        where: { archivedAt: null },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true }
      })
    ]);

    const locationNames = new Map(locations.map((location) => [location.id, location.name]));
    return {
      available: true,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        locationScopeMode: user.locationScopeMode,
        locations: user.locationScopes.map(({ location }) => location),
        operationsRole: user.operationsRole,
        operationsLocationIds: user.operationsLocationIds,
        operationsLocations: user.operationsLocationIds.map((id) => ({ id, name: locationNames.get(id) ?? id })),
        operationsAccessStatus: user.operationsAccessStatus,
        operationsLastSyncedAt: user.operationsLastSyncedAt?.toISOString() ?? null,
        operationsSyncError: user.operationsSyncError,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString()
      })),
      locations,
      roles: adminRoles
    };
  } catch (error) {
    console.warn("[admin-identity] Could not read the identity directory.", error);
    return { available: false, reason: "DATABASE_UNAVAILABLE", users: [], locations: [], roles: adminRoles };
  }
}

export async function inviteAdminUser(input: InviteAdminUserInput): Promise<AdminInvitationResult> {
  assertDatabaseConfigured();
  if (!isAdminRole(input.role)) throw new AdminIdentityInputError("Select a supported Store Admin role.");

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;
  const locationIds = [...new Set(input.locationIds.map((value) => value.trim()).filter(Boolean))];
  if (input.locationScopeMode === "LOCATIONS" && locationIds.length === 0) {
    throw new AdminIdentityInputError("Select at least one location for a location-scoped user.");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + invitationLifetimeMs);
  const prisma = getPrismaClient();

  const user = await prisma.$transaction(async (transaction) => {
    const invitationCreator = await transaction.adminUser.findFirst({
      where: { OR: [{ id: input.actorSubject }, { email: input.actorSubject.trim().toLowerCase() }] },
      select: { id: true }
    });
    if (locationIds.length > 0) {
      const locationCount = await transaction.storeLocation.count({ where: { id: { in: locationIds }, archivedAt: null } });
      if (locationCount !== locationIds.length) throw new AdminIdentityInputError("One or more selected locations are unavailable.");
    }

    const existing = await transaction.adminUser.findUnique({ where: { email } });
    if (existing && existing.status !== "INVITED") {
      throw new AdminIdentityConflictError("An active or suspended account already uses this email.");
    }

    const saved = existing
      ? await transaction.adminUser.update({
          where: { id: existing.id },
          data: {
            displayName,
            role: input.role,
            status: "INVITED",
            locationScopeMode: input.locationScopeMode,
            locationId: null,
            passwordHash: null,
            mfaEnabled: false,
            mfaSecretEncrypted: null,
            invitedAt: new Date(),
            activatedAt: null,
            suspendedAt: null,
            authVersion: { increment: 1 }
          }
        })
      : await transaction.adminUser.create({
          data: {
            email,
            displayName,
            role: input.role,
            status: "INVITED",
            locationScopeMode: input.locationScopeMode,
            invitedAt: new Date()
          }
        });

    await transaction.adminUserLocationScope.deleteMany({ where: { adminUserId: saved.id } });
    if (input.locationScopeMode === "LOCATIONS") {
      await transaction.adminUserLocationScope.createMany({
        data: locationIds.map((locationId) => ({ adminUserId: saved.id, locationId })),
        skipDuplicates: true
      });
    }
    await transaction.adminUserInvitation.updateMany({
      where: { adminUserId: saved.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await transaction.adminUserInvitation.create({
      data: { adminUserId: saved.id, tokenHash, expiresAt, createdById: invitationCreator?.id ?? null }
    });
    return saved;
  });

  await recordAdminAuditEvent({
    actorId: input.actorSubject,
    action: "ADMIN_USER_INVITED",
    entityType: "AdminUser",
    entityId: user.id,
    after: { email, role: input.role, locationScopeMode: input.locationScopeMode, locationIds }
  });

  return {
    userId: user.id,
    email,
    activationPath: `/admin/activate?token=${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString()
  };
}

export async function setAdminUserSuspended(input: {
  userId: string;
  suspended: boolean;
  actorSubject: string;
}) {
  assertDatabaseConfigured();
  const prisma = getPrismaClient();
  const current = await prisma.adminUser.findUnique({ where: { id: input.userId } });
  if (!current) throw new AdminIdentityNotFoundError();
  if (input.suspended && (current.id === input.actorSubject || current.email.toLowerCase() === input.actorSubject.trim().toLowerCase())) {
    throw new AdminIdentityInputError("You cannot suspend your own account.");
  }
  if (current.status === "INVITED") throw new AdminIdentityInputError("Invited users can be re-invited, not suspended.");
  if (input.suspended && current.role === "OWNER" && current.status === "ACTIVE") {
    const activeOwners = await prisma.adminUser.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (activeOwners <= 1) throw new AdminIdentityInputError("The last active Owner cannot be suspended.");
  }

  const nextStatus = input.suspended ? "SUSPENDED" : "ACTIVE";
  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: input.userId },
      data: {
        status: nextStatus,
        suspendedAt: input.suspended ? new Date() : null,
        authVersion: { increment: 1 }
      }
    }),
    prisma.adminSession.updateMany({
      where: { adminUserId: input.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: input.suspended ? "ACCOUNT_SUSPENDED" : "ACCESS_CHANGED" }
    })
  ]);

  await recordAdminAuditEvent({
    actorId: input.actorSubject,
    action: input.suspended ? "ADMIN_USER_SUSPENDED" : "ADMIN_USER_REACTIVATED",
    entityType: "AdminUser",
    entityId: input.userId,
    before: { status: current.status },
    after: { status: nextStatus }
  });
}

export async function updateAdminUserAccess(input: {
  userId: string;
  role: AdminRole;
  locationScopeMode: "ALL" | "LOCATIONS";
  locationIds: readonly string[];
  actorSubject: string;
}) {
  assertDatabaseConfigured();
  if (!isAdminRole(input.role)) throw new AdminIdentityInputError("Select a supported Store Admin role.");
  const locationIds = [...new Set(input.locationIds.map((value) => value.trim()).filter(Boolean))];
  if (input.locationScopeMode === "LOCATIONS" && locationIds.length === 0) {
    throw new AdminIdentityInputError("Select at least one Store Admin location.");
  }
  const prisma = getPrismaClient();
  const current = await prisma.adminUser.findUnique({
    where: { id: input.userId },
    include: { locationScopes: { select: { locationId: true } } }
  });
  if (!current) throw new AdminIdentityNotFoundError();
  if (current.status === "INVITED") throw new AdminIdentityInputError("Re-invite this user to change its pending access.");
  const actorIsTarget = current.id === input.actorSubject || current.email.toLowerCase() === input.actorSubject.trim().toLowerCase();
  if (actorIsTarget && current.role === "OWNER" && input.role !== "OWNER") {
    throw new AdminIdentityInputError("You cannot remove your own Owner role.");
  }
  if (current.role === "OWNER" && input.role !== "OWNER" && current.status === "ACTIVE") {
    const activeOwners = await prisma.adminUser.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (activeOwners <= 1) throw new AdminIdentityInputError("The last active Owner cannot be demoted.");
  }
  if (locationIds.length > 0) {
    const validLocations = await prisma.storeLocation.count({ where: { id: { in: locationIds }, archivedAt: null } });
    if (validLocations !== locationIds.length) throw new AdminIdentityInputError("One or more selected locations are unavailable.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.adminUser.update({
      where: { id: current.id },
      data: { role: input.role, locationScopeMode: input.locationScopeMode, locationId: null, authVersion: { increment: 1 } }
    });
    await transaction.adminUserLocationScope.deleteMany({ where: { adminUserId: current.id } });
    if (input.locationScopeMode === "LOCATIONS") {
      await transaction.adminUserLocationScope.createMany({ data: locationIds.map((locationId) => ({ adminUserId: current.id, locationId })) });
    }
    await transaction.adminSession.updateMany({
      where: { adminUserId: current.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "ADMIN_ACCESS_CHANGED" }
    });
  });

  await recordAdminAuditEvent({
    actorId: input.actorSubject,
    action: "ADMIN_USER_ACCESS_UPDATED",
    entityType: "AdminUser",
    entityId: current.id,
    before: { role: current.role, locationScopeMode: current.locationScopeMode, locationIds: current.locationScopes.map(({ locationId }) => locationId) },
    after: { role: input.role, locationScopeMode: input.locationScopeMode, locationIds }
  });
}

export async function revokeAdminUserSessions(input: { userId: string; actorSubject: string }) {
  assertDatabaseConfigured();
  const result = await getPrismaClient().adminSession.updateMany({
    where: { adminUserId: input.userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "OWNER_REVOKED" }
  });
  await recordAdminAuditEvent({
    actorId: input.actorSubject,
    action: "ADMIN_USER_SESSIONS_REVOKED",
    entityType: "AdminUser",
    entityId: input.userId,
    after: { revokedSessionCount: result.count }
  });
  return result.count;
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) throw new AdminIdentityUnavailableError();
}

export class AdminIdentityInputError extends Error {}
export class AdminIdentityConflictError extends Error {}
export class AdminIdentityNotFoundError extends Error {
  constructor() {
    super("Admin user was not found.");
  }
}
export class AdminIdentityUnavailableError extends Error {
  constructor() {
    super("The identity database is unavailable.");
  }
}
