/** Password + MFA authentication for database-backed Store Admin identities. */

import "server-only";

import { createHash } from "node:crypto";
import { getPrismaClient } from "@/server/db/prisma";
import { hashAdminPassword, verifyAdminPassword } from "@/server/admin/admin-login";
import {
  createAdminSession,
  decryptMfaSecret,
  verifyRecoveryCodeAndCreateMfaProof,
  verifyTotpAndCreateMfaProof,
  type AdminMfaProof
} from "@/server/admin/identity";

export function isDatabaseAdminIdentityEnabled() {
  return process.env.ADMIN_IDENTITY_MODE === "DATABASE";
}

export async function authenticateDatabaseAdmin(input: {
  email: string;
  password: string;
  mfaCode?: string;
  clientAddress?: string;
  userAgent?: string | null;
}) {
  if (!isDatabaseAdminIdentityEnabled() || !process.env.DATABASE_URL) return null;
  const prisma = getPrismaClient();
  const email = input.email.trim().toLowerCase();
  const user = await prisma.adminUser.findUnique({
    where: { email },
    include: { recoveryCodes: { where: { usedAt: null }, select: { id: true, codeHash: true } } }
  });
  const passwordHash = user?.passwordHash || dummyPasswordHash();
  const passwordValid = verifyAdminPassword(input.password, passwordHash);
  if (!user || !passwordValid || user.status !== "ACTIVE" || !user.mfaEnabled || !user.mfaSecretEncrypted) return null;

  const mfaCode = input.mfaCode?.trim() ?? "";
  let proof: AdminMfaProof | null = null;
  if (/^\d{6}$/.test(mfaCode)) {
    const secret = decryptMfaSecret(user.mfaSecretEncrypted);
    proof = verifyTotpAndCreateMfaProof({ secret, code: mfaCode });
  } else if (mfaCode) {
    for (const recoveryCode of user.recoveryCodes) {
      const candidate = verifyRecoveryCodeAndCreateMfaProof({ code: mfaCode, expectedHash: recoveryCode.codeHash });
      if (!candidate) continue;
      const consumed = await prisma.adminRecoveryCode.updateMany({
        where: { id: recoveryCode.id, adminUserId: user.id, usedAt: null },
        data: { usedAt: new Date() }
      });
      if (consumed.count === 1) proof = candidate;
      break;
    }
  }
  if (!proof) return null;

  const session = await createAdminSession({
    adminUserId: user.id,
    mfaProof: proof,
    ipHash: input.clientAddress ? hashClientAddress(input.clientAddress) : null,
    userAgent: input.userAgent
  });
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ...session, userId: user.id };
}

function dummyPasswordHash() {
  return hashAdminPassword("database-admin-dummy-password", Buffer.alloc(16, 41));
}

function hashClientAddress(address: string) {
  return createHash("sha256")
    .update(`${process.env.ADMIN_RECOVERY_CODE_PEPPER ?? ""}:${address.trim()}`, "utf8")
    .digest("base64url");
}
