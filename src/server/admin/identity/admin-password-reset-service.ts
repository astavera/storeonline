/** Secure, single-use password recovery for database-backed Store Admin users. */

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { hashAdminPassword } from "@/server/admin/admin-login";
import { getPrismaClient } from "@/server/db/prisma";

const resetLifetimeMs = 30 * 60 * 1_000;

export function isAdminPasswordResetEmailConfigured() {
  return Boolean(
    process.env.ADMIN_IDENTITY_MODE === "DATABASE"
    && process.env.RESEND_API_KEY?.trim()
    && resetEmailFrom()
    && readAdminPublicOrigin()
  );
}

export function createAdminPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAdminPasswordResetToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function requestAdminPasswordReset(email: string) {
  if (!isAdminPasswordResetEmailConfigured() || !process.env.DATABASE_URL) {
    throw new AdminPasswordResetUnavailableError();
  }

  const normalizedEmail = email.trim().toLowerCase();
  const prisma = getPrismaClient();
  const user = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.status !== "ACTIVE") return { accepted: true } as const;

  const token = createAdminPasswordResetToken();
  const expiresAt = new Date(Date.now() + resetLifetimeMs);
  const reset = await prisma.$transaction(async (transaction) => {
    await transaction.adminPasswordReset.updateMany({
      where: { adminUserId: user.id, consumedAt: null },
      data: { consumedAt: new Date() }
    });
    return transaction.adminPasswordReset.create({
      data: { adminUserId: user.id, tokenHash: hashAdminPasswordResetToken(token), expiresAt }
    });
  });

  try {
    await sendAdminPasswordResetEmail({ email: user.email, resetId: reset.id, token });
  } catch (error) {
    await prisma.adminPasswordReset.deleteMany({ where: { id: reset.id, consumedAt: null } }).catch(() => undefined);
    throw error;
  }
  return { accepted: true } as const;
}

export async function readAdminPasswordReset(token: string) {
  if (process.env.ADMIN_IDENTITY_MODE !== "DATABASE" || !isResetToken(token) || !process.env.DATABASE_URL) return null;
  const reset = await getPrismaClient().adminPasswordReset.findUnique({
    where: { tokenHash: hashAdminPasswordResetToken(token) },
    include: { adminUser: { select: { status: true } } }
  });
  return reset && !reset.consumedAt && reset.expiresAt > new Date() && reset.adminUser.status === "ACTIVE"
    ? { expiresAt: reset.expiresAt.toISOString() }
    : null;
}

export async function completeAdminPasswordReset(input: { token: string; password: string }) {
  if (process.env.ADMIN_IDENTITY_MODE !== "DATABASE" || !isResetToken(input.token) || input.password.length < 12 || input.password.length > 512 || !process.env.DATABASE_URL) {
    throw new AdminPasswordResetInvalidError();
  }
  const prisma = getPrismaClient();
  const tokenHash = hashAdminPasswordResetToken(input.token);
  const reset = await prisma.adminPasswordReset.findUnique({
    where: { tokenHash },
    include: { adminUser: { select: { id: true, status: true } } }
  });
  if (!reset || reset.consumedAt || reset.expiresAt <= new Date() || reset.adminUser.status !== "ACTIVE") {
    throw new AdminPasswordResetInvalidError();
  }

  const passwordHash = hashAdminPassword(input.password);
  await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.adminPasswordReset.updateMany({
      where: { id: reset.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() }
    });
    if (claimed.count !== 1) throw new AdminPasswordResetInvalidError();
    await transaction.adminUser.update({
      where: { id: reset.adminUser.id },
      data: { passwordHash, authVersion: { increment: 1 } }
    });
    await transaction.adminSession.updateMany({
      where: { adminUserId: reset.adminUser.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "PASSWORD_RESET" }
    });
    await transaction.adminPasswordReset.updateMany({
      where: { adminUserId: reset.adminUser.id, consumedAt: null },
      data: { consumedAt: new Date() }
    });
  });
  return { ok: true } as const;
}

async function sendAdminPasswordResetEmail(input: { email: string; resetId: string; token: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resetEmailFrom();
  const origin = readAdminPublicOrigin();
  if (!apiKey || !from || !origin) throw new AdminPasswordResetUnavailableError();
  const resetUrl = `${origin}/admin/reset-password?token=${encodeURIComponent(input.token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `admin-password-reset-${input.resetId}`
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Reset your Modern State Admin password",
      text: `Use this private link within 30 minutes to reset your Modern State Admin password: ${resetUrl}\n\nIf you did not request this change, you can ignore this email.`,
      html: passwordResetEmailHtml(resetUrl)
    })
  });
  if (!response.ok) throw new AdminPasswordResetUnavailableError();
}

function resetEmailFrom() {
  return process.env.ADMIN_PASSWORD_RESET_EMAIL_FROM?.trim() || process.env.CUSTOMER_AUTH_EMAIL_FROM?.trim() || "";
}

function readAdminPublicOrigin() {
  try {
    const value = process.env.ADMIN_PUBLIC_URL?.trim() ?? "";
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.origin !== value.replace(/\/$/, "") || parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function isResetToken(token: string) {
  return token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
}

function passwordResetEmailHtml(resetUrl: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#111827"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:14px;padding:32px"><p style="font-size:13px;font-weight:700;color:#155bc2">MODERN STATE ADMIN</p><h1 style="font-size:24px;margin:16px 0 8px">Reset your password</h1><p style="color:#53606f;line-height:1.6">Use the secure link below within 30 minutes. Your authenticator will still be required when you sign in.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;border-radius:8px;background:#155bc2;color:#fff;padding:13px 20px;text-decoration:none;font-weight:700">Reset Admin password</a></p><p style="font-size:13px;color:#53606f">If you did not request this change, ignore this email.</p></div></body></html>`;
}

export class AdminPasswordResetUnavailableError extends Error {
  constructor() {
    super("Password recovery email is not configured.");
  }
}

export class AdminPasswordResetInvalidError extends Error {
  constructor() {
    super("This password reset link is invalid or expired.");
  }
}
