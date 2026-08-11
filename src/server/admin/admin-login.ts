/**
 * Implements server-side admin login behavior and persistence boundaries.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const passwordHashPrefix = "scrypt-v1";
const passwordKeyLength = 64;
const passwordScryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const dummyPasswordHash = hashAdminPassword("not-the-configured-admin-password", Buffer.alloc(16, 17));

export function isAdminLoginConfigured() {
  return Boolean(process.env.ADMIN_LOGIN_EMAIL?.trim() && process.env.ADMIN_PASSWORD_HASH?.trim() && process.env.ADMIN_SESSION_SECRET?.trim());
}

export function hashAdminPassword(password: string, salt = randomBytes(16)) {
  if (password.length < 12) {
    throw new TypeError("Admin passwords must contain at least 12 characters.");
  }

  const derivedKey = scryptSync(password, salt, passwordKeyLength, passwordScryptOptions);
  return `${passwordHashPrefix}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export function verifyAdminPassword(password: string, encodedHash: string) {
  try {
    const [prefix, encodedSalt, encodedKey, extra] = encodedHash.split("$");
    if (prefix !== passwordHashPrefix || !encodedSalt || !encodedKey || extra) return false;

    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");
    if (salt.length < 16 || expectedKey.length !== passwordKeyLength) return false;

    const receivedKey = scryptSync(password, salt, expectedKey.length, passwordScryptOptions);
    return timingSafeEqual(expectedKey, receivedKey);
  } catch {
    return false;
  }
}

export function verifyAdminCredentials(email: string, password: string) {
  const configuredEmail = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase() ?? "admin-not-configured@example.invalid";
  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim() || dummyPasswordHash;
  const passwordMatches = verifyAdminPassword(password, configuredHash);
  const emailMatches = safeDigestEqual(email.trim().toLowerCase(), configuredEmail);

  return isAdminLoginConfigured() && passwordMatches && emailMatches;
}

function safeDigestEqual(left: string, right: string) {
  return timingSafeEqual(
    createHash("sha256").update(left, "utf8").digest(),
    createHash("sha256").update(right, "utf8").digest()
  );
}
