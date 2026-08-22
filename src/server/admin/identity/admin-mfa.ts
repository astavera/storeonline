/** Cryptographic primitives for Store Admin TOTP and recovery codes. */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const encryptionVersion = "v1";
const encryptionAad = Buffer.from("modern-state-admin:mfa:v1", "utf8");
const mfaProofs = new WeakMap<object, Date>();
declare const adminMfaProofType: unique symbol;

export type AdminMfaProof = Readonly<{
  verifiedAt: Date;
  [adminMfaProofType]: true;
}>;

export type TotpOptions = Readonly<{
  digits?: number;
  periodSeconds?: number;
  timestampMs?: number;
}>;

export function generateMfaSecret(byteLength = 20): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 20) {
    throw new AdminMfaConfigurationError("MFA secrets must contain at least 20 random bytes.");
  }
  return encodeBase32(randomBytes(byteLength));
}

export function generateTotpCode(secret: string, options: TotpOptions = {}): string {
  const digits = options.digits ?? 6;
  const periodSeconds = options.periodSeconds ?? 30;
  const timestampMs = options.timestampMs ?? Date.now();
  validateTotpOptions(digits, periodSeconds, timestampMs);

  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return binary.toString().padStart(digits, "0");
}

export function verifyTotpCode(input: {
  secret: string;
  code: string;
  timestampMs?: number;
  digits?: number;
  periodSeconds?: number;
  window?: number;
}): boolean {
  const digits = input.digits ?? 6;
  const periodSeconds = input.periodSeconds ?? 30;
  const timestampMs = input.timestampMs ?? Date.now();
  const window = input.window ?? 1;
  validateTotpOptions(digits, periodSeconds, timestampMs);
  if (!Number.isSafeInteger(window) || window < 0 || window > 2) {
    throw new AdminMfaConfigurationError("The accepted TOTP window must be between zero and two steps.");
  }
  if (!new RegExp(`^\\d{${digits}}$`).test(input.code)) return false;

  const received = Buffer.from(input.code, "utf8");
  for (let step = -window; step <= window; step += 1) {
    const expected = Buffer.from(generateTotpCode(input.secret, {
      digits,
      periodSeconds,
      timestampMs: timestampMs + step * periodSeconds * 1000
    }), "utf8");
    if (received.length === expected.length && timingSafeEqual(received, expected)) return true;
  }
  return false;
}

export function verifyTotpAndCreateMfaProof(input: {
  secret: string;
  code: string;
  timestampMs?: number;
  window?: number;
}): AdminMfaProof | null {
  const timestampMs = input.timestampMs ?? Date.now();
  if (!verifyTotpCode({ ...input, timestampMs })) return null;
  return createMfaProof(new Date(timestampMs));
}

/** Consumes a short-lived in-process proof so it cannot mint multiple sessions. */
export function consumeAdminMfaProof(proof: AdminMfaProof, now = new Date(), maximumAgeMs = 5 * 60 * 1000): boolean {
  const verifiedAt = mfaProofs.get(proof);
  if (!verifiedAt) return false;
  mfaProofs.delete(proof);
  const age = now.getTime() - verifiedAt.getTime();
  return age >= -5_000 && age <= maximumAgeMs;
}

export function encryptMfaSecret(
  secret: string,
  encodedKey = process.env.ADMIN_MFA_ENCRYPTION_KEY
): string {
  const key = readEncryptionKey(encodedKey);
  const normalizedSecret = normalizeBase32(secret);
  decodeBase32(normalizedSecret);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(encryptionAad);
  const encrypted = Buffer.concat([cipher.update(normalizedSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [encryptionVersion, nonce.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptMfaSecret(
  encryptedSecret: string,
  encodedKey = process.env.ADMIN_MFA_ENCRYPTION_KEY
): string {
  const key = readEncryptionKey(encodedKey);
  const [version, nonceValue, ciphertextValue, tagValue, extra] = encryptedSecret.split(".");
  if (version !== encryptionVersion || !nonceValue || !ciphertextValue || !tagValue || extra) {
    throw new AdminMfaDecryptionError();
  }

  try {
    const nonce = Buffer.from(nonceValue, "base64url");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error("Invalid encrypted MFA payload.");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(encryptionAad);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const normalized = normalizeBase32(plaintext);
    decodeBase32(normalized);
    return normalized;
  } catch (error) {
    if (error instanceof AdminMfaConfigurationError) throw error;
    throw new AdminMfaDecryptionError();
  }
}

export function generateRecoveryCodes(count = 10): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) {
    throw new AdminMfaConfigurationError("Recovery code count must be between one and twenty.");
  }
  return Array.from({ length: count }, () => {
    const encoded = encodeBase32(randomBytes(10));
    return encoded.match(/.{1,4}/g)?.join("-") ?? encoded;
  });
}

export function hashRecoveryCode(
  code: string,
  pepper = process.env.ADMIN_RECOVERY_CODE_PEPPER
): string {
  const normalized = normalizeRecoveryCode(code);
  const secretPepper = readRecoveryPepper(pepper);
  if (normalized.length < 12) throw new AdminMfaConfigurationError("Recovery code is malformed.");
  return `${encryptionVersion}:${createHmac("sha256", secretPepper).update(normalized, "utf8").digest("base64url")}`;
}

export function verifyRecoveryCode(
  code: string,
  expectedHash: string,
  pepper = process.env.ADMIN_RECOVERY_CODE_PEPPER
): boolean {
  let receivedHash: string;
  try {
    receivedHash = hashRecoveryCode(code, pepper);
  } catch (error) {
    if (error instanceof AdminMfaConfigurationError && code.replace(/[^A-Za-z0-9]/g, "").length < 12) return false;
    throw error;
  }
  const received = Buffer.from(receivedHash, "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Must be called in the transaction that atomically marks the recovery code used. */
export function verifyRecoveryCodeAndCreateMfaProof(input: {
  code: string;
  expectedHash: string;
  pepper?: string;
  verifiedAt?: Date;
}): AdminMfaProof | null {
  if (!verifyRecoveryCode(input.code, input.expectedHash, input.pepper)) return null;
  return createMfaProof(input.verifiedAt ?? new Date());
}

function normalizeBase32(value: string): string {
  return value.toUpperCase().replace(/[\s=-]/g, "");
}

function createMfaProof(verifiedAt: Date): AdminMfaProof {
  const proof = Object.freeze({ verifiedAt: new Date(verifiedAt) }) as AdminMfaProof;
  mfaProofs.set(proof, proof.verifiedAt);
  return proof;
}

function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += base32Alphabet[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += base32Alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  const normalized = normalizeBase32(value);
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new AdminMfaConfigurationError("MFA secret must be valid base32.");
  }
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | base32Alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function readEncryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AdminMfaConfigurationError("ADMIN_MFA_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw new AdminMfaConfigurationError("ADMIN_MFA_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");
  }
  return decoded;
}

function readRecoveryPepper(value: string | undefined): Buffer {
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new AdminMfaConfigurationError("ADMIN_RECOVERY_CODE_PEPPER must contain at least 32 bytes.");
  }
  return Buffer.from(value, "utf8");
}

function validateTotpOptions(digits: number, periodSeconds: number, timestampMs: number) {
  if (![6, 8].includes(digits)) throw new AdminMfaConfigurationError("TOTP codes must contain six or eight digits.");
  if (!Number.isSafeInteger(periodSeconds) || periodSeconds < 15 || periodSeconds > 60) {
    throw new AdminMfaConfigurationError("TOTP period must be between 15 and 60 seconds.");
  }
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new AdminMfaConfigurationError("TOTP timestamp is invalid.");
  }
}

export class AdminMfaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminMfaConfigurationError";
  }
}

export class AdminMfaDecryptionError extends Error {
  constructor() {
    super("The encrypted MFA secret could not be authenticated.");
    this.name = "AdminMfaDecryptionError";
  }
}
