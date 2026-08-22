/** Verifies password reset token and delivery configuration boundaries. */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminPasswordResetToken,
  hashAdminPasswordResetToken,
  isAdminPasswordResetEmailConfigured
} from "@/server/admin/identity/admin-password-reset-service";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Admin password reset security", () => {
  it("creates an opaque 256-bit token and stores only its SHA-256 hash", () => {
    const token = createAdminPasswordResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashAdminPasswordResetToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAdminPasswordResetToken(token)).not.toContain(token);
  });

  it("requires database identity, Resend, a sender and an HTTPS Admin origin", () => {
    vi.stubEnv("ADMIN_IDENTITY_MODE", "DATABASE");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("ADMIN_PASSWORD_RESET_EMAIL_FROM", "Modern State <admin@example.com>");
    vi.stubEnv("ADMIN_PUBLIC_URL", "https://admin.example.com");
    expect(isAdminPasswordResetEmailConfigured()).toBe(true);

    vi.stubEnv("ADMIN_PUBLIC_URL", "http://admin.example.com");
    expect(isAdminPasswordResetEmailConfigured()).toBe(false);
  });
});
