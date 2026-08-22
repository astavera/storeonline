/** One-time invitation activation with mandatory MFA enrollment. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";
import { hashAdminPassword } from "@/server/admin/admin-login";
import {
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  isAdminRole,
  verifyTotpCode
} from "@/server/admin/identity";
import { hashOpaqueToken } from "@/server/admin/identity/admin-user-service";

export type AdminInvitationView = {
  email: string;
  displayName: string | null;
  role: string;
  expiresAt: string;
};

export async function readAdminInvitation(token: string): Promise<AdminInvitationView | null> {
  if (!isInvitationToken(token) || !process.env.DATABASE_URL) return null;
  const invitation = await getPrismaClient().adminUserInvitation.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { adminUser: { select: { email: true, displayName: true, role: true, status: true } } }
  });
  if (!isUsableInvitation(invitation)) return null;
  return {
    email: invitation.adminUser.email,
    displayName: invitation.adminUser.displayName,
    role: invitation.adminUser.role,
    expiresAt: invitation.expiresAt.toISOString()
  };
}

export async function beginAdminActivation(input: { token: string; password: string }) {
  if (!isInvitationToken(input.token) || input.password.length < 12 || input.password.length > 512) {
    throw new AdminActivationError("INVITATION_INVALID");
  }
  const prisma = getPrismaClient();
  const invitation = await prisma.adminUserInvitation.findUnique({
    where: { tokenHash: hashOpaqueToken(input.token) },
    include: { adminUser: true }
  });
  if (!isUsableInvitation(invitation) || !isAdminRole(invitation.adminUser.role)) {
    throw new AdminActivationError("INVITATION_INVALID");
  }

  const secret = generateMfaSecret();
  const encryptedSecret = encryptMfaSecret(secret);
  const passwordHash = hashAdminPassword(input.password);
  await prisma.adminUser.update({
    where: { id: invitation.adminUserId },
    data: { passwordHash, mfaSecretEncrypted: encryptedSecret, mfaEnabled: false }
  });
  const account = encodeURIComponent(invitation.adminUser.email);
  const issuer = encodeURIComponent("Modern State Admin");
  return {
    secret,
    provisioningUri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
  };
}

export async function completeAdminActivation(input: { token: string; code: string }) {
  if (!isInvitationToken(input.token) || !/^\d{6}$/.test(input.code)) {
    throw new AdminActivationError("MFA_CODE_INVALID");
  }
  const prisma = getPrismaClient();
  const invitation = await prisma.adminUserInvitation.findUnique({
    where: { tokenHash: hashOpaqueToken(input.token) },
    include: { adminUser: true }
  });
  if (!isUsableInvitation(invitation) || !invitation.adminUser.passwordHash || !invitation.adminUser.mfaSecretEncrypted || !isAdminRole(invitation.adminUser.role)) {
    throw new AdminActivationError("INVITATION_INVALID");
  }
  const { decryptMfaSecret } = await import("@/server/admin/identity/admin-mfa");
  const secret = decryptMfaSecret(invitation.adminUser.mfaSecretEncrypted);
  if (!verifyTotpCode({ secret, code: input.code })) throw new AdminActivationError("MFA_CODE_INVALID");

  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodeHashes = recoveryCodes.map((code) => hashRecoveryCode(code));
  await prisma.$transaction(async (transaction) => {
    const accepted = await transaction.adminUserInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() }
    });
    if (accepted.count !== 1) throw new AdminActivationError("INVITATION_INVALID");
    await transaction.adminRecoveryCode.deleteMany({ where: { adminUserId: invitation.adminUserId } });
    await transaction.adminRecoveryCode.createMany({
      data: recoveryCodeHashes.map((codeHash) => ({ adminUserId: invitation.adminUserId, codeHash }))
    });
    await transaction.adminUser.update({
      where: { id: invitation.adminUserId },
      data: { status: "ACTIVE", mfaEnabled: true, activatedAt: new Date(), suspendedAt: null, authVersion: { increment: 1 } }
    });
  });
  return { recoveryCodes };
}

function isInvitationToken(token: string) {
  return token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
}

function isUsableInvitation(invitation: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  adminUser: { status: string; role: string; email: string; displayName: string | null };
} | null): invitation is NonNullable<typeof invitation> {
  return Boolean(
    invitation
    && !invitation.acceptedAt
    && !invitation.revokedAt
    && invitation.expiresAt > new Date()
    && invitation.adminUser.status === "INVITED"
  );
}

export class AdminActivationError extends Error {
  constructor(readonly code: "INVITATION_INVALID" | "MFA_CODE_INVALID") {
    super(code === "MFA_CODE_INVALID" ? "The authenticator code is invalid or expired." : "This invitation is invalid or expired.");
  }
}
