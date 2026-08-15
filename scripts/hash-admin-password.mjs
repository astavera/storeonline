/**
 * Generates a secure administrative password hash for environment configuration.
 */

import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Provide an Admin password containing at least 12 characters.");
  process.exitCode = 1;
} else {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  console.log(`scrypt-v1$${salt.toString("base64url")}$${key.toString("base64url")}`);
}
