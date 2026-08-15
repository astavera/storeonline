/** PostgreSQL repository plus an isolated development preview for customer accounts. */

import "server-only";

import { randomUUID } from "node:crypto";
import type { PublicCustomerAccount } from "@/features/customers/contracts";
import { getPrismaClient } from "@/server/db/prisma";
import { isCustomerAuthDevelopmentPreview } from "./customer-security";

export type CustomerChallengeRecord = {
  id: string;
  email: string;
  codeHash: string;
  attempts: number;
  termsVersion: string;
  marketingConsentRequested: boolean;
  marketingConsentVersion: string | null;
  source: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

type CompleteLoginInput = {
  challengeId: string;
  email: string;
  termsVersion: string;
  marketingConsentRequested: boolean;
  marketingConsentVersion: string | null;
  source: string;
  sessionTokenHash: string;
  sessionExpiresAt: Date;
  now: Date;
};

export interface CustomerAccountRepository {
  createChallenge(input: CustomerChallengeRecord): Promise<void>;
  readChallenge(id: string): Promise<CustomerChallengeRecord | null>;
  incrementChallengeAttempts(id: string): Promise<number>;
  completeLogin(input: CompleteLoginInput): Promise<PublicCustomerAccount>;
  readAccountBySessionTokenHash(tokenHash: string, now: Date): Promise<PublicCustomerAccount | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  updateMarketingPreference(input: { tokenHash: string; consent: boolean; source: string; version: string; now: Date }): Promise<PublicCustomerAccount | null>;
}

export class PrismaCustomerAccountRepository implements CustomerAccountRepository {
  async createChallenge(input: CustomerChallengeRecord) {
    await getPrismaClient().customerLoginChallenge.create({ data: input });
  }

  async readChallenge(id: string) {
    return getPrismaClient().customerLoginChallenge.findUnique({ where: { id } });
  }

  async incrementChallengeAttempts(id: string) {
    const challenge = await getPrismaClient().customerLoginChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
    return challenge.attempts;
  }

  async completeLogin(input: CompleteLoginInput) {
    return getPrismaClient().$transaction(async (transaction) => {
      const consumed = await transaction.customerLoginChallenge.updateMany({
        where: { id: input.challengeId, consumedAt: null, expiresAt: { gt: input.now }, attempts: { lt: 5 } },
        data: { consumedAt: input.now }
      });
      if (consumed.count !== 1) throw new CustomerRepositoryConflictError();

      const existing = await transaction.customerAccount.findUnique({ where: { email: input.email } });
      const account = existing
        ? await transaction.customerAccount.update({
            where: { id: existing.id },
            data: {
              lastLoginAt: input.now,
              termsAcceptedAt: input.now,
              termsVersion: input.termsVersion,
              ...(input.marketingConsentRequested ? {
                marketingEmailConsent: true,
                marketingConsentAt: input.now,
                marketingConsentSource: input.source,
                marketingConsentVersion: input.marketingConsentVersion,
                marketingUnsubscribedAt: null
              } : {})
            }
          })
        : await transaction.customerAccount.create({
            data: {
              email: input.email,
              lastLoginAt: input.now,
              termsAcceptedAt: input.now,
              termsVersion: input.termsVersion,
              marketingEmailConsent: input.marketingConsentRequested,
              marketingConsentAt: input.marketingConsentRequested ? input.now : null,
              marketingConsentSource: input.marketingConsentRequested ? input.source : null,
              marketingConsentVersion: input.marketingConsentRequested ? input.marketingConsentVersion : null
            }
          });

      await transaction.customerSession.create({
        data: { customerAccountId: account.id, tokenHash: input.sessionTokenHash, expiresAt: input.sessionExpiresAt, lastSeenAt: input.now }
      });
      await transaction.customerConsentEvent.create({
        data: { customerAccountId: account.id, consentType: "TERMS", granted: true, source: input.source, policyVersion: input.termsVersion, occurredAt: input.now }
      });
      if (input.marketingConsentRequested && input.marketingConsentVersion) {
        await transaction.customerConsentEvent.create({
          data: { customerAccountId: account.id, consentType: "EMAIL_MARKETING", granted: true, source: input.source, policyVersion: input.marketingConsentVersion, occurredAt: input.now }
        });
      }
      return toPublicAccount(account);
    });
  }

  async readAccountBySessionTokenHash(tokenHash: string, now: Date) {
    const session = await getPrismaClient().customerSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { customerAccount: true }
    });
    return session ? toPublicAccount(session.customerAccount) : null;
  }

  async revokeSession(tokenHash: string, now: Date) {
    await getPrismaClient().customerSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: now } });
  }

  async updateMarketingPreference(input: { tokenHash: string; consent: boolean; source: string; version: string; now: Date }) {
    return getPrismaClient().$transaction(async (transaction) => {
      const session = await transaction.customerSession.findFirst({
        where: { tokenHash: input.tokenHash, revokedAt: null, expiresAt: { gt: input.now } },
        include: { customerAccount: true }
      });
      if (!session) return null;
      const account = await transaction.customerAccount.update({
        where: { id: session.customerAccountId },
        data: input.consent
          ? { marketingEmailConsent: true, marketingConsentAt: input.now, marketingConsentSource: input.source, marketingConsentVersion: input.version, marketingUnsubscribedAt: null }
          : { marketingEmailConsent: false, marketingUnsubscribedAt: input.now }
      });
      await transaction.customerConsentEvent.create({
        data: { customerAccountId: account.id, consentType: "EMAIL_MARKETING", granted: input.consent, source: input.source, policyVersion: input.version, occurredAt: input.now }
      });
      return toPublicAccount(account);
    });
  }
}

type MemoryAccount = PublicCustomerAccount & { termsVersion: string; termsAcceptedAt: Date };
type MemorySession = { accountId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null };
type MemoryState = {
  accounts: Map<string, MemoryAccount>;
  challenges: Map<string, CustomerChallengeRecord>;
  sessions: Map<string, MemorySession>;
};

const globalMemory = globalThis as typeof globalThis & { customerAccountPreviewState?: MemoryState };

export class InMemoryCustomerAccountRepository implements CustomerAccountRepository {
  private readonly state: MemoryState;

  constructor(state = memoryState()) {
    this.state = state;
  }

  async createChallenge(input: CustomerChallengeRecord) {
    this.state.challenges.set(input.id, { ...input });
  }

  async readChallenge(id: string) {
    return this.state.challenges.get(id) ?? null;
  }

  async incrementChallengeAttempts(id: string) {
    const challenge = this.state.challenges.get(id);
    if (!challenge) return 0;
    challenge.attempts += 1;
    return challenge.attempts;
  }

  async completeLogin(input: CompleteLoginInput) {
    const challenge = this.state.challenges.get(input.challengeId);
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= input.now || challenge.attempts >= 5) throw new CustomerRepositoryConflictError();
    challenge.consumedAt = input.now;
    const existing = this.state.accounts.get(input.email);
    const account: MemoryAccount = existing ?? {
      id: randomUUID(),
      email: input.email,
      firstName: null,
      marketingEmailConsent: false,
      termsAcceptedAt: input.now,
      termsVersion: input.termsVersion
    };
    account.termsAcceptedAt = input.now;
    account.termsVersion = input.termsVersion;
    if (input.marketingConsentRequested) account.marketingEmailConsent = true;
    this.state.accounts.set(input.email, account);
    this.state.sessions.set(input.sessionTokenHash, {
      accountId: account.id,
      tokenHash: input.sessionTokenHash,
      expiresAt: input.sessionExpiresAt,
      revokedAt: null
    });
    return { id: account.id, email: account.email, firstName: account.firstName, marketingEmailConsent: account.marketingEmailConsent };
  }

  async readAccountBySessionTokenHash(tokenHash: string, now: Date) {
    const session = this.state.sessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const account = Array.from(this.state.accounts.values()).find((candidate) => candidate.id === session.accountId);
    return account ? { id: account.id, email: account.email, firstName: account.firstName, marketingEmailConsent: account.marketingEmailConsent } : null;
  }

  async revokeSession(tokenHash: string, now: Date) {
    const session = this.state.sessions.get(tokenHash);
    if (session) session.revokedAt = now;
  }

  async updateMarketingPreference(input: { tokenHash: string; consent: boolean; now: Date }) {
    const session = this.state.sessions.get(input.tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= input.now) return null;
    const account = Array.from(this.state.accounts.values()).find((candidate) => candidate.id === session.accountId);
    if (!account) return null;
    account.marketingEmailConsent = input.consent;
    return { id: account.id, email: account.email, firstName: account.firstName, marketingEmailConsent: account.marketingEmailConsent };
  }
}

const prismaRepository = new PrismaCustomerAccountRepository();
const previewRepository = new InMemoryCustomerAccountRepository();
let overrideRepository: CustomerAccountRepository | undefined;

export function getCustomerAccountRepository() {
  return overrideRepository ?? (isCustomerAuthDevelopmentPreview() ? previewRepository : prismaRepository);
}

export function setCustomerAccountRepository(repository: CustomerAccountRepository | undefined) {
  overrideRepository = repository;
}

function memoryState() {
  globalMemory.customerAccountPreviewState ??= { accounts: new Map(), challenges: new Map(), sessions: new Map() };
  return globalMemory.customerAccountPreviewState;
}

function toPublicAccount(account: { id: string; email: string; firstName: string | null; marketingEmailConsent: boolean }): PublicCustomerAccount {
  return { id: account.id, email: account.email, firstName: account.firstName, marketingEmailConsent: account.marketingEmailConsent };
}

export class CustomerRepositoryConflictError extends Error {
  constructor() {
    super("The login challenge is no longer available.");
    this.name = "CustomerRepositoryConflictError";
  }
}
