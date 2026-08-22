/** Database-backed opaque and revocable Store Admin sessions. */

import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";
import {
  consumeAdminMfaProof,
  type AdminMfaProof
} from "@/server/admin/identity/admin-mfa";
import {
  adminRoles,
  isAdminRole,
  type AdminPrincipal
} from "@/server/admin/identity/admin-rbac";

const defaultAbsoluteLifetimeMs = 12 * 60 * 60 * 1000;
const defaultIdleLifetimeMs = 30 * 60 * 1000;

type StoreOptions = Readonly<{
  absoluteLifetimeMs?: number;
  idleLifetimeMs?: number;
}>;

export type CreateAdminSessionInput = Readonly<{
  adminUserId: string;
  mfaProof: AdminMfaProof;
  ipHash?: string | null;
  userAgent?: string | null;
  now?: Date;
}>;

export type CreatedAdminSession = Readonly<{
  token: string;
  sessionId: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}>;

export type ResolvedAdminSession = Readonly<{
  sessionId: string;
  principal: AdminPrincipal;
  expiresAt: Date;
  idleExpiresAt: Date;
}>;

export class PrismaAdminSessionStore {
  private readonly absoluteLifetimeMs: number;
  private readonly idleLifetimeMs: number;

  constructor(
    private readonly prisma: PrismaClient = getPrismaClient(),
    options: StoreOptions = {}
  ) {
    this.absoluteLifetimeMs = options.absoluteLifetimeMs ?? defaultAbsoluteLifetimeMs;
    this.idleLifetimeMs = options.idleLifetimeMs ?? defaultIdleLifetimeMs;
    if (
      !Number.isSafeInteger(this.absoluteLifetimeMs) ||
      !Number.isSafeInteger(this.idleLifetimeMs) ||
      this.absoluteLifetimeMs <= 0 ||
      this.idleLifetimeMs <= 0 ||
      this.idleLifetimeMs > this.absoluteLifetimeMs
    ) {
      throw new AdminSessionStoreError("ADMIN_SESSION_LIFETIME_INVALID");
    }
  }

  async create(input: CreateAdminSessionInput): Promise<CreatedAdminSession> {
    const now = input.now ?? new Date();
    if (!consumeAdminMfaProof(input.mfaProof, now)) {
      throw new AdminSessionStoreError("ADMIN_MFA_PROOF_INVALID");
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.absoluteLifetimeMs);
    const idleExpiresAt = new Date(Math.min(expiresAt.getTime(), now.getTime() + this.idleLifetimeMs));

    const session = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.adminUser.findUnique({
        where: { id: input.adminUserId },
        select: { id: true, role: true, status: true, mfaEnabled: true, authVersion: true }
      });
      if (!user || user.status !== "ACTIVE") throw new AdminSessionStoreError("ADMIN_IDENTITY_INACTIVE");
      if (!user.mfaEnabled) throw new AdminSessionStoreError("ADMIN_MFA_REQUIRED");
      if (!isAdminRole(user.role)) throw new AdminSessionStoreError("ADMIN_ROLE_INVALID");

      return transaction.adminSession.create({
        data: {
          adminUserId: user.id,
          tokenHash: hashAdminSessionToken(token),
          authVersion: user.authVersion,
          mfaVerified: true,
          ipHash: input.ipHash ?? null,
          userAgent: input.userAgent?.slice(0, 512) ?? null,
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
          idleExpiresAt
        },
        select: { id: true }
      });
    });

    return { token, sessionId: session.id, expiresAt, idleExpiresAt };
  }

  async resolve(token: string | undefined, now = new Date()): Promise<ResolvedAdminSession | null> {
    if (!isOpaqueSessionToken(token)) return null;
    const tokenHash = hashAdminSessionToken(token);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: {
        adminUser: {
          include: { locationScopes: { select: { locationId: true } } }
        }
      }
    });
    if (!session) return null;

    const invalidReason = invalidSessionReason(session, now);
    if (invalidReason) {
      if (!session.revokedAt) {
        await this.prisma.adminSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now, revokedReason: invalidReason }
        });
      }
      return null;
    }

    const idleExpiresAt = new Date(Math.min(session.expiresAt.getTime(), now.getTime() + this.idleLifetimeMs));
    const touched = await this.prisma.adminSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        mfaVerified: true,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
        authVersion: session.adminUser.authVersion,
        adminUser: {
          is: {
            status: "ACTIVE",
            mfaEnabled: true,
            authVersion: session.adminUser.authVersion,
            role: { in: [...adminRoles] }
          }
        }
      },
      data: { lastSeenAt: now, idleExpiresAt }
    });
    if (touched.count !== 1) return null;

    const role = session.adminUser.role;
    if (!isAdminRole(role)) return null;
    const locationScope = session.adminUser.locationScopeMode === "ALL"
      ? { kind: "ALL" } as const
      : {
          kind: "LOCATIONS" as const,
          locationIds: Array.from(new Set(session.adminUser.locationScopes.map((scope) => scope.locationId)))
        };

    return {
      sessionId: session.id,
      principal: {
        id: session.adminUser.id,
        role,
        status: "ACTIVE",
        mfaVerified: true,
        locationScope
      },
      expiresAt: session.expiresAt,
      idleExpiresAt
    };
  }

  async revoke(token: string | undefined, reason = "USER_LOGOUT", now = new Date()): Promise<boolean> {
    if (!isOpaqueSessionToken(token)) return false;
    const result = await this.prisma.adminSession.updateMany({
      where: { tokenHash: hashAdminSessionToken(token), revokedAt: null },
      data: { revokedAt: now, revokedReason: normalizeRevocationReason(reason) }
    });
    return result.count > 0;
  }

  async revokeAllForUser(adminUserId: string, reason = "SECURITY_REVOCATION", now = new Date()): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.adminUser.update({
        where: { id: adminUserId },
        data: { authVersion: { increment: 1 } }
      });
      const revoked = await transaction.adminSession.updateMany({
        where: { adminUserId, revokedAt: null },
        data: { revokedAt: now, revokedReason: normalizeRevocationReason(reason) }
      });
      return revoked.count;
    });
  }
}

export function hashAdminSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export async function createAdminSession(input: CreateAdminSessionInput) {
  return new PrismaAdminSessionStore().create(input);
}

export async function resolveAdminSessionToken(token: string | undefined, now?: Date) {
  return new PrismaAdminSessionStore().resolve(token, now);
}

export async function revokeAdminSessionToken(token: string | undefined, reason?: string, now?: Date) {
  return new PrismaAdminSessionStore().revoke(token, reason, now);
}

export async function revokeAllAdminSessions(adminUserId: string, reason?: string, now?: Date) {
  return new PrismaAdminSessionStore().revokeAllForUser(adminUserId, reason, now);
}

function invalidSessionReason(session: {
  revokedAt: Date | null;
  expiresAt: Date;
  idleExpiresAt: Date;
  authVersion: number;
  mfaVerified: boolean;
  adminUser: {
    role: string;
    status: string;
    mfaEnabled: boolean;
    authVersion: number;
  };
}, now: Date): string | null {
  if (session.revokedAt) return "ALREADY_REVOKED";
  if (session.expiresAt <= now) return "ABSOLUTE_EXPIRATION";
  if (session.idleExpiresAt <= now) return "IDLE_EXPIRATION";
  if (!session.mfaVerified || !session.adminUser.mfaEnabled) return "MFA_NOT_VERIFIED";
  if (session.adminUser.status !== "ACTIVE") return "IDENTITY_INACTIVE";
  if (!isAdminRole(session.adminUser.role)) return "ROLE_INVALID";
  if (session.authVersion !== session.adminUser.authVersion) return "AUTH_VERSION_CHANGED";
  return null;
}

function isOpaqueSessionToken(token: string | undefined): token is string {
  if (!token || token.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(token)) return false;
  return Buffer.from(token, "base64url").length === 32;
}

function normalizeRevocationReason(reason: string): string {
  const normalized = reason.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 64);
  return normalized || "REVOKED";
}

export class AdminSessionStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdminSessionStoreError";
  }
}
