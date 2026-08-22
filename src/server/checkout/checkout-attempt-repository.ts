/**
 * Implements server-side checkout attempt repository behavior and persistence boundaries.
 */

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

export type ShippingCheckoutRecord = {
  attemptId: string;
  requestHash: string;
  quote: CartQuote;
  expiresAt: Date;
  fulfillmentMode: "SHIPPING";
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
  checkoutUrl: string | null;
  orderproShippingOrderId: string;
  shippingContext: unknown;
};

export type SplitCheckoutRecord = {
  attemptId: string;
  requestHash: string;
  quote: CartQuote;
  expiresAt: Date;
  checkoutVersion: 2;
  context: unknown;
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
  checkoutUrl: string | null;
};

export interface CheckoutAttemptRepository {
  recordValidation(input: Omit<CheckoutValidationRecord, "attemptId" | "replayed">): Promise<CheckoutValidationRecord>;
  findValidation(input: { idempotencyKey: string; requestHash: string }): Promise<CheckoutValidationRecord | null>;
  recordShippingReservation(input: {
    attemptId: string;
    orderproShippingOrderId: string;
    shippingContext: unknown;
  }): Promise<ShippingCheckoutRecord>;
  recordHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
    checkoutUrl: string;
  }): Promise<ShippingCheckoutRecord>;
  recordSplitCheckoutContext(input: { attemptId: string; context: unknown }): Promise<SplitCheckoutRecord>;
  recordSplitHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
    checkoutUrl: string;
  }): Promise<SplitCheckoutRecord>;
  findSplitCheckout(attemptId: string): Promise<SplitCheckoutRecord | null>;
  listExpiredSplitCheckouts(input: { now?: Date; limit?: number }): Promise<SplitCheckoutRecord[]>;
  markSplitCheckoutExpired(attemptId: string): Promise<void>;
  markSplitCheckoutCompleted(attemptId: string): Promise<void>;
  findShippingCheckout(attemptId: string): Promise<ShippingCheckoutRecord | null>;
  listExpiredShippingCheckouts(input: { now?: Date; limit?: number }): Promise<ShippingCheckoutRecord[]>;
  markShippingCheckoutExpired(attemptId: string): Promise<void>;
  markShippingCheckoutCompleted(attemptId: string): Promise<void>;
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
  private readonly shipping = new Map<string, ShippingCheckoutRecord>();
  private readonly split = new Map<string, SplitCheckoutRecord>();

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

  async findValidation(input: { idempotencyKey: string; requestHash: string }) {
    const existing = this.attempts.get(input.idempotencyKey);
    if (!existing) return null;
    if (existing.requestHash !== input.requestHash) throw new CheckoutIdempotencyConflictError();
    return { ...existing, replayed: true };
  }

  async recordShippingReservation(input: {
    attemptId: string;
    orderproShippingOrderId: string;
    shippingContext: unknown;
  }) {
    const attempt = [...this.attempts.values()].find((candidate) => candidate.attemptId === input.attemptId);
    if (!attempt) throw new Error("Checkout attempt does not exist.");
    const existing = this.shipping.get(input.attemptId);
    if (existing) {
      if (existing.orderproShippingOrderId !== input.orderproShippingOrderId) {
        throw new CheckoutIdempotencyConflictError();
      }
      return existing;
    }
    const record: ShippingCheckoutRecord = {
      attemptId: attempt.attemptId,
      requestHash: attempt.requestHash,
      quote: attempt.quote,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      fulfillmentMode: "SHIPPING",
      squareOrderId: null,
      squarePaymentLinkId: null,
      checkoutUrl: null,
      orderproShippingOrderId: input.orderproShippingOrderId,
      shippingContext: input.shippingContext
    };
    this.shipping.set(input.attemptId, record);
    return record;
  }

  async recordHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
    checkoutUrl: string;
  }) {
    const record = this.shipping.get(input.attemptId);
    if (!record) throw new Error("Shipping checkout reservation does not exist.");
    if (
      (record.squareOrderId && record.squareOrderId !== input.squareOrderId) ||
      (record.squarePaymentLinkId && record.squarePaymentLinkId !== input.squarePaymentLinkId) ||
      (record.checkoutUrl && record.checkoutUrl !== input.checkoutUrl)
    ) {
      throw new CheckoutIdempotencyConflictError();
    }
    const updated = {
      ...record,
      squareOrderId: input.squareOrderId,
      squarePaymentLinkId: input.squarePaymentLinkId,
      checkoutUrl: input.checkoutUrl
    };
    this.shipping.set(input.attemptId, updated);
    return updated;
  }

  async recordSplitCheckoutContext(input: { attemptId: string; context: unknown }) {
    const attempt = [...this.attempts.values()].find((candidate) => candidate.attemptId === input.attemptId);
    if (!attempt) throw new Error("Checkout attempt does not exist.");
    const existing = this.split.get(input.attemptId);
    if (existing) return existing;
    const record: SplitCheckoutRecord = {
      attemptId: attempt.attemptId,
      requestHash: attempt.requestHash,
      quote: attempt.quote,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      checkoutVersion: 2,
      context: input.context,
      squareOrderId: null,
      squarePaymentLinkId: null,
      checkoutUrl: null
    };
    this.split.set(input.attemptId, record);
    return record;
  }

  async recordSplitHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
    checkoutUrl: string;
  }) {
    const record = this.split.get(input.attemptId);
    if (!record) throw new Error("Split checkout context does not exist.");
    if (
      (record.squareOrderId && record.squareOrderId !== input.squareOrderId)
      || (record.squarePaymentLinkId && record.squarePaymentLinkId !== input.squarePaymentLinkId)
      || (record.checkoutUrl && record.checkoutUrl !== input.checkoutUrl)
    ) {
      throw new CheckoutIdempotencyConflictError();
    }
    const updated = {
      ...record,
      squareOrderId: input.squareOrderId,
      squarePaymentLinkId: input.squarePaymentLinkId,
      checkoutUrl: input.checkoutUrl
    };
    this.split.set(input.attemptId, updated);
    return updated;
  }

  async findSplitCheckout(attemptId: string) {
    return this.split.get(attemptId) ?? null;
  }

  async listExpiredSplitCheckouts(input: { now?: Date; limit?: number }) {
    const now = input.now ?? new Date();
    return [...this.split.values()]
      .filter((record) => record.squarePaymentLinkId && record.expiresAt <= now)
      .slice(0, Math.min(100, Math.max(1, input.limit ?? 25)));
  }

  async markSplitCheckoutExpired(attemptId: string) {
    this.split.delete(attemptId);
  }

  async markSplitCheckoutCompleted(attemptId: string) {
    // Keep the correlation available so duplicate Square webhooks can replay
    // the idempotent OrderPRO notification during local/test execution.
    void attemptId;
  }

  async findShippingCheckout(attemptId: string) {
    return this.shipping.get(attemptId) ?? null;
  }

  async listExpiredShippingCheckouts(input: { now?: Date; limit?: number }) {
    const now = input.now ?? new Date();
    return [...this.shipping.values()]
      .filter((record) => !this.split.has(record.attemptId) && record.squarePaymentLinkId && record.expiresAt <= now)
      .slice(0, Math.min(100, Math.max(1, input.limit ?? 25)));
  }

  async markShippingCheckoutExpired(attemptId: string) {
    const record = this.shipping.get(attemptId);
    if (record) this.shipping.delete(attemptId);
  }

  async markShippingCheckoutCompleted(attemptId: string) {
    const record = this.shipping.get(attemptId);
    if (record) this.shipping.delete(attemptId);
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
  },

  async findValidation(input) {
    try {
      const existing = await getPrismaClient().checkoutAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      return existing ? replayDatabaseRecord(existing, input.requestHash) : null;
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Checkout attempt", { cause: error });
    }
  },

  async recordShippingReservation(input) {
    try {
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          fulfillmentMode: "SHIPPING",
          orderproShippingOrderId: input.orderproShippingOrderId,
          shippingContext: toPrismaJson(input.shippingContext)
        }
      });
      return toShippingRecord(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await getPrismaClient().checkoutAttempt.findUnique({ where: { id: input.attemptId } });
        if (existing?.orderproShippingOrderId === input.orderproShippingOrderId) return toShippingRecord(existing);
        throw new CheckoutIdempotencyConflictError();
      }
      throw new PersistenceUnavailableError("Shipping checkout reservation", { cause: error });
    }
  },

  async recordHostedCheckout(input) {
    try {
      const existing = await getPrismaClient().checkoutAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      if (
        !existing.orderproShippingOrderId ||
        existing.fulfillmentMode !== "SHIPPING" ||
        (existing.squareOrderId && existing.squareOrderId !== input.squareOrderId) ||
        (existing.squarePaymentLinkId && existing.squarePaymentLinkId !== input.squarePaymentLinkId) ||
        (existing.squareCheckoutUrl && existing.squareCheckoutUrl !== input.checkoutUrl)
      ) {
        throw new CheckoutIdempotencyConflictError();
      }
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          squareOrderId: input.squareOrderId,
          squarePaymentLinkId: input.squarePaymentLinkId,
          squareCheckoutUrl: input.checkoutUrl,
          hostedCheckoutCreatedAt: existing.hostedCheckoutCreatedAt ?? new Date()
        }
      });
      return toShippingRecord(updated);
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Square hosted checkout correlation", { cause: error });
    }
  },

  async recordSplitCheckoutContext(input) {
    try {
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          checkoutVersion: 2,
          splitCheckoutContext: toPrismaJson(input.context)
        }
      });
      return toSplitRecord(updated);
    } catch (error) {
      throw new PersistenceUnavailableError("Split checkout context", { cause: error });
    }
  },

  async recordSplitHostedCheckout(input) {
    try {
      const existing = await getPrismaClient().checkoutAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      if (
        existing.checkoutVersion !== 2
        || !existing.splitCheckoutContext
        || (existing.squareOrderId && existing.squareOrderId !== input.squareOrderId)
        || (existing.squarePaymentLinkId && existing.squarePaymentLinkId !== input.squarePaymentLinkId)
        || (existing.squareCheckoutUrl && existing.squareCheckoutUrl !== input.checkoutUrl)
      ) {
        throw new CheckoutIdempotencyConflictError();
      }
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          squareOrderId: input.squareOrderId,
          squarePaymentLinkId: input.squarePaymentLinkId,
          squareCheckoutUrl: input.checkoutUrl,
          hostedCheckoutCreatedAt: existing.hostedCheckoutCreatedAt ?? new Date()
        }
      });
      return toSplitRecord(updated);
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Split Square checkout correlation", { cause: error });
    }
  },

  async findSplitCheckout(attemptId) {
    try {
      const record = await getPrismaClient().checkoutAttempt.findFirst({
        where: { id: attemptId, status: "VALIDATED" }
      });
      if (!record || record.checkoutVersion !== 2 || !record.splitCheckoutContext) return null;
      return toSplitRecord(record);
    } catch (error) {
      throw new PersistenceUnavailableError("Split checkout correlation", { cause: error });
    }
  },

  async listExpiredSplitCheckouts(input) {
    try {
      const records = await getPrismaClient().checkoutAttempt.findMany({
        where: {
          checkoutVersion: 2,
          status: "VALIDATED",
          expiresAt: { lte: input.now ?? new Date() },
          squarePaymentLinkId: { not: null },
          splitCheckoutContext: { not: Prisma.DbNull }
        },
        orderBy: { expiresAt: "asc" },
        take: Math.min(100, Math.max(1, input.limit ?? 25))
      });
      return records.map(toSplitRecord);
    } catch (error) {
      throw new PersistenceUnavailableError("Expired split checkouts", { cause: error });
    }
  },

  async markSplitCheckoutExpired(attemptId) {
    try {
      await getPrismaClient().checkoutAttempt.updateMany({
        where: { id: attemptId, checkoutVersion: 2, status: "VALIDATED" },
        data: { status: "EXPIRED" }
      });
    } catch (error) {
      throw new PersistenceUnavailableError("Expired split checkout", { cause: error });
    }
  },

  async markSplitCheckoutCompleted(attemptId) {
    try {
      await getPrismaClient().checkoutAttempt.updateMany({
        where: { id: attemptId, checkoutVersion: 2, status: "VALIDATED" },
        data: { status: "COMPLETED" }
      });
    } catch (error) {
      throw new PersistenceUnavailableError("Completed split checkout", { cause: error });
    }
  },

  async findShippingCheckout(attemptId) {
    try {
      const record = await getPrismaClient().checkoutAttempt.findUnique({ where: { id: attemptId } });
      if (!record || record.fulfillmentMode !== "SHIPPING" || !record.orderproShippingOrderId) return null;
      return toShippingRecord(record);
    } catch (error) {
      throw new PersistenceUnavailableError("Shipping checkout correlation", { cause: error });
    }
  },

  async listExpiredShippingCheckouts(input) {
    try {
      const records = await getPrismaClient().checkoutAttempt.findMany({
        where: {
          checkoutVersion: 1,
          fulfillmentMode: "SHIPPING",
          status: "VALIDATED",
          expiresAt: { lte: input.now ?? new Date() },
          squarePaymentLinkId: { not: null },
          orderproShippingOrderId: { not: null }
        },
        orderBy: { expiresAt: "asc" },
        take: Math.min(100, Math.max(1, input.limit ?? 25))
      });
      return records.map(toShippingRecord);
    } catch (error) {
      throw new PersistenceUnavailableError("Expired shipping checkouts", { cause: error });
    }
  },

  async markShippingCheckoutExpired(attemptId) {
    try {
      await getPrismaClient().checkoutAttempt.updateMany({
        where: { id: attemptId, fulfillmentMode: "SHIPPING", status: "VALIDATED" },
        data: { status: "EXPIRED" }
      });
    } catch (error) {
      throw new PersistenceUnavailableError("Expired shipping checkout", { cause: error });
    }
  },

  async markShippingCheckoutCompleted(attemptId) {
    try {
      await getPrismaClient().checkoutAttempt.updateMany({
        where: { id: attemptId, fulfillmentMode: "SHIPPING", status: "VALIDATED" },
        data: { status: "COMPLETED" }
      });
    } catch (error) {
      throw new PersistenceUnavailableError("Completed shipping checkout", { cause: error });
    }
  }
};

function toSplitRecord(record: {
  id: string;
  requestHash: string;
  quote: unknown;
  expiresAt: Date;
  checkoutVersion: number;
  splitCheckoutContext: unknown;
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
  squareCheckoutUrl: string | null;
}): SplitCheckoutRecord {
  if (record.checkoutVersion !== 2 || !record.splitCheckoutContext) {
    throw new Error("Checkout attempt is not a split checkout.");
  }
  return {
    attemptId: record.id,
    requestHash: record.requestHash,
    quote: record.quote as CartQuote,
    expiresAt: record.expiresAt,
    checkoutVersion: 2,
    context: record.splitCheckoutContext,
    squareOrderId: record.squareOrderId,
    squarePaymentLinkId: record.squarePaymentLinkId,
    checkoutUrl: record.squareCheckoutUrl
  };
}

function toShippingRecord(record: {
  id: string;
  requestHash: string;
  quote: unknown;
  expiresAt: Date;
  fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING" | null;
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
  squareCheckoutUrl: string | null;
  orderproShippingOrderId: string | null;
  shippingContext: unknown;
}): ShippingCheckoutRecord {
  if (record.fulfillmentMode !== "SHIPPING" || !record.orderproShippingOrderId) {
    throw new Error("Checkout attempt is not a correlated shipping checkout.");
  }
  return {
    attemptId: record.id,
    requestHash: record.requestHash,
    quote: record.quote as CartQuote,
    expiresAt: record.expiresAt,
    fulfillmentMode: "SHIPPING",
    squareOrderId: record.squareOrderId,
    squarePaymentLinkId: record.squarePaymentLinkId,
    checkoutUrl: record.squareCheckoutUrl,
    orderproShippingOrderId: record.orderproShippingOrderId,
    shippingContext: record.shippingContext
  };
}

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
