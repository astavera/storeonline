/** Verifies RFC 6238 MFA primitives and protected recovery codes. */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AdminMfaConfigurationError,
  AdminMfaDecryptionError,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  generateTotpCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyRecoveryCodeAndCreateMfaProof,
  verifyTotpAndCreateMfaProof,
  verifyTotpCode
} from "@/server/admin/identity";

const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const encryptionKey = randomBytes(32).toString("base64url");
const recoveryPepper = "recovery-pepper-with-at-least-thirty-two-bytes";

describe("Store Admin MFA", () => {
  it.each([
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"]
  ])("matches the RFC 6238 SHA-1 vector at %i seconds", (timestampSeconds, expected) => {
    expect(generateTotpCode(rfcSecret, {
      digits: 8,
      periodSeconds: 30,
      timestampMs: timestampSeconds * 1000
    })).toBe(expected);
  });

  it("accepts only a small configured TOTP time window", () => {
    const timestampMs = 1_700_000_000_000;
    const previousCode = generateTotpCode(rfcSecret, { timestampMs: timestampMs - 30_000 });
    expect(verifyTotpCode({ secret: rfcSecret, code: previousCode, timestampMs, window: 1 })).toBe(true);
    expect(verifyTotpCode({ secret: rfcSecret, code: previousCode, timestampMs, window: 0 })).toBe(false);
    expect(verifyTotpCode({ secret: rfcSecret, code: "12345x", timestampMs })).toBe(false);
  });

  it("creates an MFA proof only after a valid TOTP verification", () => {
    const timestampMs = 1_700_000_000_000;
    const code = generateTotpCode(rfcSecret, { timestampMs });
    expect(verifyTotpAndCreateMfaProof({ secret: rfcSecret, code, timestampMs })).toMatchObject({
      verifiedAt: new Date(timestampMs)
    });
    expect(verifyTotpAndCreateMfaProof({ secret: rfcSecret, code: "000000", timestampMs })).toBeNull();
  });

  it("encrypts MFA secrets with authenticated AES-256-GCM", () => {
    const secret = generateMfaSecret();
    const encrypted = encryptMfaSecret(secret, encryptionKey);
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted, encryptionKey)).toBe(secret);

    const parts = encrypted.split(".");
    parts[2] = `${parts[2].startsWith("A") ? "B" : "A"}${parts[2].slice(1)}`;
    expect(() => decryptMfaSecret(parts.join("."), encryptionKey)).toThrow(AdminMfaDecryptionError);
  });

  it("fails closed for malformed encryption keys", () => {
    expect(() => encryptMfaSecret(rfcSecret, "short-key")).toThrow(AdminMfaConfigurationError);
  });

  it("generates unique high-entropy recovery codes and verifies normalized input", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/.test(code))).toBe(true);

    const hash = hashRecoveryCode(codes[0], recoveryPepper);
    expect(verifyRecoveryCode(codes[0].toLowerCase().replaceAll("-", " "), hash, recoveryPepper)).toBe(true);
    expect(verifyRecoveryCode(codes[1], hash, recoveryPepper)).toBe(false);
    expect(verifyRecoveryCode(codes[0], hash, `${recoveryPepper}-different`)).toBe(false);
    expect(verifyRecoveryCodeAndCreateMfaProof({
      code: codes[0],
      expectedHash: hash,
      pepper: recoveryPepper,
      verifiedAt: new Date("2026-08-19T15:00:00.000Z")
    })).toMatchObject({ verifiedAt: new Date("2026-08-19T15:00:00.000Z") });
  });
});
