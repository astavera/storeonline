/**
 * Verifies the isolated behavior of admin login.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashAdminPassword,
  isAdminLoginConfigured,
  isValidAdminPasswordHash,
  verifyAdminCredentials,
  verifyAdminPassword
} from "@/server/admin/admin-login";

afterEach(() => vi.unstubAllEnvs());

describe("Admin login credentials", () => {
  it("hashes and verifies a password without storing plaintext", () => {
    const password = "a-long-admin-password";
    const encoded = hashAdminPassword(password, Buffer.alloc(16, 7));

    expect(encoded).toMatch(/^scrypt-v1\$/);
    expect(encoded).not.toContain(password);
    expect(isValidAdminPasswordHash(encoded)).toBe(true);
    expect(verifyAdminPassword(password, encoded)).toBe(true);
    expect(verifyAdminPassword("wrong-admin-password", encoded)).toBe(false);
    expect(isValidAdminPasswordHash("scrypt-v1$short$short")).toBe(false);
    expect(isValidAdminPasswordHash("scrypt-v1$not+base64url$not+base64url")).toBe(false);
  });

  it("requires a complete configuration and matches email case-insensitively", () => {
    vi.stubEnv("ADMIN_LOGIN_EMAIL", "Owner@Example.com");
    vi.stubEnv("ADMIN_PASSWORD_HASH", hashAdminPassword("another-long-password", Buffer.alloc(16, 9)));
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-admin-session-secret-that-is-at-least-32-bytes");

    expect(isAdminLoginConfigured()).toBe(true);
    expect(verifyAdminCredentials("owner@example.com", "another-long-password")).toBe(true);
    expect(verifyAdminCredentials("other@example.com", "another-long-password")).toBe(false);
  });
});
