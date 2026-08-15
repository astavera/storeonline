/** Coordinates passwordless customer login and preference changes. */

import "server-only";

import { randomUUID } from "node:crypto";
import { customerMarketingConsentVersion, customerTermsVersion } from "@/features/customers/contracts";
import { sendCustomerLoginEmail } from "./customer-email";
import { CustomerRepositoryConflictError, getCustomerAccountRepository } from "./customer-account-repository";
import {
  createCustomerLoginCode,
  createCustomerSessionToken,
  customerChallengeLifetimeSeconds,
  customerChallengeMaximumAttempts,
  customerLoginCodeMatches,
  customerSessionLifetimeSeconds,
  hashCustomerLoginCode,
  hashCustomerSessionToken,
  isCustomerAuthDevelopmentPreview,
  maskCustomerEmail,
  normalizeCustomerEmail
} from "./customer-security";

export async function startCustomerLogin(input: { email: string; marketingConsent: boolean; source?: string; now?: Date }) {
  const now = input.now ?? new Date();
  const email = normalizeCustomerEmail(input.email);
  const challengeId = randomUUID();
  const code = createCustomerLoginCode();
  const expiresAt = new Date(now.getTime() + customerChallengeLifetimeSeconds * 1000);
  const source = input.source ?? "account_drawer";
  await getCustomerAccountRepository().createChallenge({
    id: challengeId,
    email,
    codeHash: hashCustomerLoginCode(challengeId, code),
    attempts: 0,
    termsVersion: customerTermsVersion,
    marketingConsentRequested: input.marketingConsent,
    marketingConsentVersion: input.marketingConsent ? customerMarketingConsentVersion : null,
    source,
    expiresAt,
    consumedAt: null
  });
  await sendCustomerLoginEmail({ challengeId, code, email });
  return {
    challengeId,
    maskedEmail: maskCustomerEmail(email),
    expiresInSeconds: customerChallengeLifetimeSeconds,
    ...(isCustomerAuthDevelopmentPreview() ? { developmentCode: code } : {})
  };
}

export async function verifyCustomerLogin(input: { challengeId: string; code: string; now?: Date }) {
  const now = input.now ?? new Date();
  const repository = getCustomerAccountRepository();
  const challenge = await repository.readChallenge(input.challengeId);
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= customerChallengeMaximumAttempts) {
    throw new CustomerAuthenticationError("LOGIN_CODE_EXPIRED", "This code has expired. Request a new one.");
  }
  if (!customerLoginCodeMatches({ challengeId: challenge.id, code: input.code, expectedHash: challenge.codeHash })) {
    const attempts = await repository.incrementChallengeAttempts(challenge.id);
    if (attempts >= customerChallengeMaximumAttempts) {
      throw new CustomerAuthenticationError("LOGIN_CODE_LOCKED", "Too many incorrect attempts. Request a new code.");
    }
    throw new CustomerAuthenticationError("LOGIN_CODE_INVALID", "That code is incorrect. Try again.");
  }

  const token = createCustomerSessionToken();
  try {
    const account = await repository.completeLogin({
      challengeId: challenge.id,
      email: challenge.email,
      termsVersion: challenge.termsVersion,
      marketingConsentRequested: challenge.marketingConsentRequested,
      marketingConsentVersion: challenge.marketingConsentVersion,
      source: challenge.source,
      sessionTokenHash: hashCustomerSessionToken(token),
      sessionExpiresAt: new Date(now.getTime() + customerSessionLifetimeSeconds * 1000),
      now
    });
    return { account, token };
  } catch (error) {
    if (error instanceof CustomerRepositoryConflictError) {
      throw new CustomerAuthenticationError("LOGIN_CODE_EXPIRED", "This code has expired. Request a new one.");
    }
    throw error;
  }
}

export async function readCustomerSession(token: string | undefined, now = new Date()) {
  if (!token) return null;
  return getCustomerAccountRepository().readAccountBySessionTokenHash(hashCustomerSessionToken(token), now);
}

export async function revokeCustomerSession(token: string | undefined, now = new Date()) {
  if (!token) return;
  await getCustomerAccountRepository().revokeSession(hashCustomerSessionToken(token), now);
}

export async function updateCustomerMarketingPreference(token: string | undefined, consent: boolean, now = new Date()) {
  if (!token) return null;
  return getCustomerAccountRepository().updateMarketingPreference({
    tokenHash: hashCustomerSessionToken(token),
    consent,
    source: "account_preferences",
    version: customerMarketingConsentVersion,
    now
  });
}

export class CustomerAuthenticationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CustomerAuthenticationError";
    this.code = code;
  }
}
