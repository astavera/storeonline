/** Verifies the security boundary for customer passwordless login. */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customerLoginCodeMatches,
  hashCustomerLoginCode,
  isTrustedCustomerMutationOrigin,
  maskCustomerEmail,
  normalizeCustomerEmail
} from "@/server/customers/customer-security";

const secret = "test-customer-session-secret-that-is-at-least-32-bytes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("customer account security", () => {
  it("normalizes and masks customer emails without exposing the full address", () => {
    expect(normalizeCustomerEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
    expect(maskCustomerEmail("jane.doe@example.com")).toBe("j•••@example.com");
  });

  it("hashes OTP values and compares them without storing plaintext", () => {
    const codeHash = hashCustomerLoginCode("challenge-1", "123456", secret);
    expect(codeHash).not.toContain("123456");
    expect(customerLoginCodeMatches({ challengeId: "challenge-1", code: "123456", expectedHash: codeHash, secret })).toBe(true);
    expect(customerLoginCodeMatches({ challengeId: "challenge-1", code: "654321", expectedHash: codeHash, secret })).toBe(false);
  });

  it("rejects missing and foreign mutation origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.com");
    expect(isTrustedCustomerMutationOrigin(new Request("https://shop.example.com/api/account", { method: "POST" }))).toBe(false);
    expect(isTrustedCustomerMutationOrigin(new Request("https://shop.example.com/api/account", { method: "POST", headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(isTrustedCustomerMutationOrigin(new Request("https://shop.example.com/api/account", { method: "POST", headers: { origin: "https://shop.example.com" } }))).toBe(true);
    expect(isTrustedCustomerMutationOrigin(new Request("http://internal:3000/api/account", { method: "POST", headers: { host: "127.0.0.1:8080", origin: "http://127.0.0.1:8080" } }))).toBe(true);
  });
});
