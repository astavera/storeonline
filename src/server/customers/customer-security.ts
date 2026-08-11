/** Security primitives for passwordless storefront customer sessions. */

import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const customerSessionCookieName = "modern_state_customer";
export const customerSessionLifetimeSeconds = 30 * 24 * 60 * 60;
export const customerChallengeLifetimeSeconds = 10 * 60;
export const customerChallengeMaximumAttempts = 5;

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export function maskCustomerEmail(email: string) {
  const [localPart, domain] = normalizeCustomerEmail(email).split("@");
  if (!localPart || !domain) return "your email";
  return `${localPart.slice(0, 1)}${"•".repeat(Math.min(3, Math.max(1, localPart.length - 1)))}@${domain}`;
}

export function createCustomerLoginCode() {
  return String(randomInt(100_000, 1_000_000));
}

export function createCustomerSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCustomerSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashCustomerLoginCode(challengeId: string, code: string, secret = getCustomerSessionSecret()) {
  return createHmac("sha256", secret).update(`${challengeId}:${code}`, "utf8").digest("hex");
}

export function customerLoginCodeMatches(input: { challengeId: string; code: string; expectedHash: string; secret?: string }) {
  const supplied = Buffer.from(hashCustomerLoginCode(input.challengeId, input.code, input.secret), "hex");
  const expected = Buffer.from(input.expectedHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function isCustomerAuthDevelopmentPreview() {
  return process.env.NODE_ENV === "development" && process.env.CUSTOMER_AUTH_DEV_PREVIEW !== "false";
}

export function getCustomerSessionSecret() {
  const configured = process.env.CUSTOMER_SESSION_SECRET?.trim();
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) return configured;
  if (isCustomerAuthDevelopmentPreview()) return "modern-state-development-customer-session-secret-only";
  throw new Error("CUSTOMER_SESSION_SECRET must contain at least 32 bytes.");
}

export function isTrustedCustomerMutationOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const publicHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
      || request.headers.get("host")?.trim();
    const originUrl = new URL(origin);
    if (publicHost && originUrl.host === publicHost && ["http:", "https:"].includes(originUrl.protocol)) return true;
  } catch {
    return false;
  }

  const allowed = new Set([requestOrigin]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      allowed.add(new URL(siteUrl).origin);
    } catch {
      // Invalid public URLs fail closed instead of weakening origin checks.
    }
  }
  return allowed.has(origin);
}
