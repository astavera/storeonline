import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CartQuote } from "@/server/checkout/cart-service";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

export type CheckoutValidationRecord = {
  attemptId: string;
  idempotencyKey: string;
  requestHash: string;
  quote: CartQuote;
  errors: string[];
  replayed: boolean;
};

export interface CheckoutAttemptRepository {
  recordValidation(input: Omit<CheckoutValidationRecord, "attemptId" | "replayed">): Promise<CheckoutValidationRecord>;
}

export class CheckoutIdempotencyConflictError extends Error {
  constructor() {
    super("The idempotency key was already used for a different checkout request.");
    this.name = "CheckoutIdempotencyConflictError";
  }
}

export function hashCheckoutRequest(input: unknown) {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function getCheckoutAttemptRepository(): CheckoutAttemptRepository {
  const persistence = requireDatabaseOrDevelopmentFallback("Checkout attempt");
  return persistence === "database" ? prismaCheckoutAttemptRepository : developmentCheckoutAttemptRepository;
}

export class InMemoryCheckoutAttemptRepository implements CheckoutAttemptRepository {
  private readonly attempts = new Map<string, CheckoutValidationRecord>();

  async recordValidation(input: Omit<CheckoutValidationRecord, "attemptId" | "replayed">) {
    const existing = this.attempts.get(input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new CheckoutIdempotencyConflictError();
      return { ...existing, replayed: true };
    }

    const created = { ...input, attemptId: `development-${this.attempts.size + 1}`, replayed: false };
    this.attempts.set(input.idempotencyKey, created);
    return created;
  }
}

const developmentCheckoutAttemptRepository = new InMemoryCheckoutAttemptRepository();

const prismaCheckoutAttemptRepository: CheckoutAttemptRepository = {
  async recordValidation(input) {
    const prisma = getPrismaClient();
    try {
      const existing = await prisma.checkoutAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return replayDatabaseRecord(existing, input.requestHash);

      try {
        const created = await prisma.checkoutAttempt.create({
          data: {
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            status: input.errors.length === 0 ? "VALIDATED" : "REJECTED",
            quote: toPrismaJson(input.quote),
            validationErrors: toPrismaJson(input.errors),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
          }
        });
        return { ...input, attemptId: created.id, replayed: false };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const winner = await prisma.checkoutAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (!winner) throw error;
        return replayDatabaseRecord(winner, input.requestHash);
      }
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Checkout attempt", { cause: error });
    }
  }
};

function replayDatabaseRecord(
  record: { id: string; idempotencyKey: string; requestHash: string; quote: unknown; validationErrors: unknown },
  requestHash: string
): CheckoutValidationRecord {
  if (record.requestHash !== requestHash) throw new CheckoutIdempotencyConflictError();
  return {
    attemptId: record.id,
    idempotencyKey: record.idempotencyKey,
    requestHash: record.requestHash,
    quote: record.quote as CartQuote,
    errors: Array.isArray(record.validationErrors) ? record.validationErrors.filter((value): value is string => typeof value === "string") : [],
    replayed: true
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
