/** Verifies opaque, revocable and location-scoped Store Admin sessions. */

import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  AdminSessionStoreError,
  PrismaAdminSessionStore,
  generateTotpCode,
  hashAdminSessionToken,
  verifyTotpAndCreateMfaProof
} from "@/server/admin/identity";

type FakeUser = {
  id: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  authVersion: number;
  locationScopeMode: string;
  locationScopes: Array<{ locationId: string }>;
};

type FakeSession = {
  id: string;
  adminUserId: string;
  tokenHash: string;
  authVersion: number;
  mfaVerified: boolean;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
};

function fakePrisma(overrides: Partial<FakeUser> = {}) {
  const user: FakeUser = {
    id: "admin-1",
    role: "OWNER",
    status: "ACTIVE",
    mfaEnabled: true,
    authVersion: 1,
    locationScopeMode: "LOCATIONS",
    locationScopes: [{ locationId: "location-1" }, { locationId: "location-2" }],
    ...overrides
  };
  const sessions: FakeSession[] = [];

  const client = {
    adminUser: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === user.id ? user : null,
      update: async ({ data }: { data: { authVersion: { increment: number } } }) => {
        user.authVersion += data.authVersion.increment;
        return user;
      }
    },
    adminSession: {
      create: async ({ data }: { data: Omit<FakeSession, "id" | "revokedAt" | "revokedReason"> }) => {
        const session: FakeSession = { id: `session-${sessions.length + 1}`, revokedAt: null, revokedReason: null, ...data };
        sessions.push(session);
        return { id: session.id };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const session = sessions.find((candidate) => candidate.tokenHash === where.tokenHash);
        return session ? { ...session, adminUser: user } : null;
      },
      updateMany: async ({ where, data }: {
        where: { id?: string; adminUserId?: string; tokenHash?: string; revokedAt?: null; mfaVerified?: boolean; expiresAt?: { gt: Date }; idleExpiresAt?: { gt: Date }; authVersion?: number; adminUser?: unknown };
        data: Partial<FakeSession>;
      }) => {
        const matching = sessions.filter((session) =>
          (!where.id || session.id === where.id) &&
          (!where.adminUserId || session.adminUserId === where.adminUserId) &&
          (!where.tokenHash || session.tokenHash === where.tokenHash) &&
          (where.revokedAt !== null || session.revokedAt === null) &&
          (where.mfaVerified === undefined || session.mfaVerified === where.mfaVerified) &&
          (!where.expiresAt || session.expiresAt > where.expiresAt.gt) &&
          (!where.idleExpiresAt || session.idleExpiresAt > where.idleExpiresAt.gt) &&
          (where.authVersion === undefined || session.authVersion === where.authVersion)
        );
        matching.forEach((session) => Object.assign(session, data));
        return { count: matching.length };
      }
    },
    $transaction: async (operation: (transaction: unknown) => unknown) => operation(client)
  };

  return { prisma: client as unknown as PrismaClient, sessions, user };
}

const now = new Date("2026-08-19T15:00:00.000Z");
const mfaSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function mfaProof(at = now) {
  const code = generateTotpCode(mfaSecret, { timestampMs: at.getTime() });
  const proof = verifyTotpAndCreateMfaProof({ secret: mfaSecret, code, timestampMs: at.getTime() });
  if (!proof) throw new Error("Expected a valid MFA proof in test setup.");
  return proof;
}

describe("Prisma Store Admin session store", () => {
  it("creates only a hashed, MFA-verified opaque session", async () => {
    const setup = fakePrisma();
    const store = new PrismaAdminSessionStore(setup.prisma, { absoluteLifetimeMs: 60_000, idleLifetimeMs: 20_000 });
    const created = await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now, userAgent: "browser" });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setup.sessions[0].tokenHash).toBe(hashAdminSessionToken(created.token));
    expect(setup.sessions[0].tokenHash).not.toBe(created.token);
    expect(setup.sessions[0].mfaVerified).toBe(true);
    expect(setup.sessions[0].authVersion).toBe(1);
  });

  it("requires a fresh, single-use MFA proof", async () => {
    const setup = fakePrisma();
    const store = new PrismaAdminSessionStore(setup.prisma);
    const proof = mfaProof();
    await store.create({ adminUserId: setup.user.id, mfaProof: proof, now });

    const reused = await store.create({ adminUserId: setup.user.id, mfaProof: proof, now }).catch((reason) => reason);
    expect(reused).toBeInstanceOf(AdminSessionStoreError);
    expect(reused.code).toBe("ADMIN_MFA_PROOF_INVALID");

    const staleTime = new Date(now.getTime() - 5 * 60 * 1000 - 1);
    const stale = await store.create({
      adminUserId: setup.user.id,
      mfaProof: mfaProof(staleTime),
      now
    }).catch((reason) => reason);
    expect(stale.code).toBe("ADMIN_MFA_PROOF_INVALID");
  });

  it.each([
    [{ status: "SUSPENDED" }, "ADMIN_IDENTITY_INACTIVE"],
    [{ mfaEnabled: false }, "ADMIN_MFA_REQUIRED"],
    [{ role: "STORE_STAFF" }, "ADMIN_ROLE_INVALID"],
    [{ role: "VIEWER" }, "ADMIN_ROLE_INVALID"]
  ])("rejects invalid identities before persistence", async (userOverride, code) => {
    const setup = fakePrisma(userOverride);
    const store = new PrismaAdminSessionStore(setup.prisma);
    const error = await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now }).catch((reason) => reason);
    expect(error).toBeInstanceOf(AdminSessionStoreError);
    expect(error.code).toBe(code);
    expect(setup.sessions).toHaveLength(0);
  });

  it("resolves a valid session, maps locations and extends only its idle expiration", async () => {
    const setup = fakePrisma();
    const store = new PrismaAdminSessionStore(setup.prisma, { absoluteLifetimeMs: 60_000, idleLifetimeMs: 20_000 });
    const created = await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now });
    const resolved = await store.resolve(created.token, new Date(now.getTime() + 10_000));

    expect(resolved).toMatchObject({
      sessionId: created.sessionId,
      principal: {
        id: setup.user.id,
        role: "OWNER",
        mfaVerified: true,
        locationScope: { kind: "LOCATIONS", locationIds: ["location-1", "location-2"] }
      }
    });
    expect(resolved?.idleExpiresAt).toEqual(new Date(now.getTime() + 30_000));
    expect(resolved?.expiresAt).toEqual(new Date(now.getTime() + 60_000));
  });

  it.each([
    ["mfa", (setup: ReturnType<typeof fakePrisma>) => { setup.sessions[0].mfaVerified = false; }],
    ["auth version", (setup: ReturnType<typeof fakePrisma>) => { setup.user.authVersion += 1; }],
    ["suspension", (setup: ReturnType<typeof fakePrisma>) => { setup.user.status = "SUSPENDED"; }],
    ["legacy role", (setup: ReturnType<typeof fakePrisma>) => { setup.user.role = "WAREHOUSE_STAFF"; }]
  ])("rejects and revokes a session invalidated by %s", async (_label, invalidate) => {
    const setup = fakePrisma();
    const store = new PrismaAdminSessionStore(setup.prisma);
    const created = await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now });
    invalidate(setup);

    await expect(store.resolve(created.token, new Date(now.getTime() + 1_000))).resolves.toBeNull();
    expect(setup.sessions[0].revokedAt).toEqual(new Date(now.getTime() + 1_000));
  });

  it("rejects absolute and idle expiration and never accepts malformed tokens", async () => {
    const setup = fakePrisma();
    const store = new PrismaAdminSessionStore(setup.prisma, { absoluteLifetimeMs: 60_000, idleLifetimeMs: 10_000 });
    const created = await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now });

    await expect(store.resolve("not-a-session-token", now)).resolves.toBeNull();
    await expect(store.resolve(created.token, new Date(now.getTime() + 10_001))).resolves.toBeNull();
    expect(setup.sessions[0].revokedReason).toBe("IDLE_EXPIRATION");
  });

  it("revokes one session by token and all user sessions by auth version", async () => {
    const setup = fakePrisma();
    const store = new PrismaAdminSessionStore(setup.prisma);
    const first = await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now });
    await store.create({ adminUserId: setup.user.id, mfaProof: mfaProof(), now });

    await expect(store.revoke(first.token, "user logout", now)).resolves.toBe(true);
    await expect(store.resolve(first.token, now)).resolves.toBeNull();
    await expect(store.revokeAllForUser(setup.user.id, "security reset", now)).resolves.toBe(1);
    expect(setup.user.authVersion).toBe(2);
    expect(setup.sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });
});
