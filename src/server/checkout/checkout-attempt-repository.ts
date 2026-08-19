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
  orderproShippingOrderId: string;
  shippingContext: unknown;
};

export type CapacityCheckoutRecord = {
  attemptId: string;
  requestHash: string;
  quote: CartQuote;
  expiresAt: Date;
  fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY";
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
  squarePaymentId: string | null;
  orderproCapacityHoldId: string;
  fulfillmentContext: unknown;
};

export interface CheckoutAttemptRepository {
  recordValidation(input: Omit<CheckoutValidationRecord, "attemptId" | "replayed">): Promise<CheckoutValidationRecord>;
  recordShippingReservation(input: {
    attemptId: string;
    orderproShippingOrderId: string;
    shippingContext: unknown;
  }): Promise<ShippingCheckoutRecord>;
  recordHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
  }): Promise<ShippingCheckoutRecord>;
  findShippingCheckout(attemptId: string): Promise<ShippingCheckoutRecord | null>;
  listExpiredShippingCheckouts(input: { now?: Date; limit?: number }): Promise<ShippingCheckoutRecord[]>;
  markShippingCheckoutExpired(attemptId: string): Promise<void>;
  markShippingCheckoutCompleted(attemptId: string): Promise<void>;
  recordCapacityReservation(input: {
    attemptId: string;
    fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY";
    orderproCapacityHoldId: string;
    fulfillmentContext: unknown;
    expiresAt: Date;
  }): Promise<CapacityCheckoutRecord>;
  recordCapacityHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
  }): Promise<CapacityCheckoutRecord>;
  findCapacityCheckout(attemptId: string): Promise<CapacityCheckoutRecord | null>;
  listExpiredCapacityCheckouts(input: { now?: Date; limit?: number }): Promise<CapacityCheckoutRecord[]>;
  markCapacityCheckoutExpired(attemptId: string): Promise<void>;
  markCapacityCheckoutCompleted(input: { attemptId: string; squarePaymentId: string }): Promise<void>;
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
  private readonly capacity = new Map<string, CapacityCheckoutRecord>();

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
  }) {
    const record = this.shipping.get(input.attemptId);
    if (!record) throw new Error("Shipping checkout reservation does not exist.");
    if (
      (record.squareOrderId && record.squareOrderId !== input.squareOrderId) ||
      (record.squarePaymentLinkId && record.squarePaymentLinkId !== input.squarePaymentLinkId)
    ) {
      throw new CheckoutIdempotencyConflictError();
    }
    const updated = {
      ...record,
      squareOrderId: input.squareOrderId,
      squarePaymentLinkId: input.squarePaymentLinkId
    };
    this.shipping.set(input.attemptId, updated);
    return updated;
  }

  async findShippingCheckout(attemptId: string) {
    return this.shipping.get(attemptId) ?? null;
  }

  async listExpiredShippingCheckouts(input: { now?: Date; limit?: number }) {
    const now = input.now ?? new Date();
    return [...this.shipping.values()]
      .filter((record) => record.squarePaymentLinkId && record.expiresAt <= now)
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

  async recordCapacityReservation(input: {
    attemptId: string;
    fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY";
    orderproCapacityHoldId: string;
    fulfillmentContext: unknown;
    expiresAt: Date;
  }) {
    const attempt = [...this.attempts.values()].find((candidate) => candidate.attemptId === input.attemptId);
    if (!attempt) throw new Error("Checkout attempt does not exist.");
    const existing = this.capacity.get(input.attemptId);
    if (existing) {
      if (
        existing.orderproCapacityHoldId !== input.orderproCapacityHoldId ||
        existing.fulfillmentMode !== input.fulfillmentMode
      ) throw new CheckoutIdempotencyConflictError();
      return existing;
    }
    const record: CapacityCheckoutRecord = {
      attemptId: attempt.attemptId,
      requestHash: attempt.requestHash,
      quote: attempt.quote,
      expiresAt: input.expiresAt,
      fulfillmentMode: input.fulfillmentMode,
      squareOrderId: null,
      squarePaymentLinkId: null,
      squarePaymentId: null,
      orderproCapacityHoldId: input.orderproCapacityHoldId,
      fulfillmentContext: input.fulfillmentContext
    };
    this.capacity.set(input.attemptId, record);
    return record;
  }

  async recordCapacityHostedCheckout(input: {
    attemptId: string;
    squareOrderId: string;
    squarePaymentLinkId: string;
  }) {
    const existing = this.capacity.get(input.attemptId);
    if (!existing) throw new Error("Capacity checkout reservation does not exist.");
    if (
      (existing.squareOrderId && existing.squareOrderId !== input.squareOrderId) ||
      (existing.squarePaymentLinkId && existing.squarePaymentLinkId !== input.squarePaymentLinkId)
    ) throw new CheckoutIdempotencyConflictError();
    const updated = { ...existing, ...input };
    this.capacity.set(input.attemptId, updated);
    return updated;
  }

  async findCapacityCheckout(attemptId: string) {
    return this.capacity.get(attemptId) ?? null;
  }

  async listExpiredCapacityCheckouts(input: { now?: Date; limit?: number }) {
    const now = input.now ?? new Date();
    return [...this.capacity.values()]
      .filter((record) => record.squarePaymentLinkId && record.expiresAt <= now)
      .slice(0, Math.min(100, Math.max(1, input.limit ?? 25)));
  }

  async markCapacityCheckoutExpired(attemptId: string) {
    this.capacity.delete(attemptId);
  }

  async markCapacityCheckoutCompleted(input: { attemptId: string; squarePaymentId: string }) {
    const existing = this.capacity.get(input.attemptId);
    if (existing) this.capacity.set(input.attemptId, { ...existing, squarePaymentId: input.squarePaymentId });
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
        (existing.squarePaymentLinkId && existing.squarePaymentLinkId !== input.squarePaymentLinkId)
      ) {
        throw new CheckoutIdempotencyConflictError();
      }
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          squareOrderId: input.squareOrderId,
          squarePaymentLinkId: input.squarePaymentLinkId,
          hostedCheckoutCreatedAt: existing.hostedCheckoutCreatedAt ?? new Date()
        }
      });
      return toShippingRecord(updated);
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Square hosted checkout correlation", { cause: error });
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
  },

  async recordCapacityReservation(input) {
    try {
      const existing = await getPrismaClient().checkoutAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      if (
        (existing.orderproCapacityHoldId && existing.orderproCapacityHoldId !== input.orderproCapacityHoldId) ||
        (existing.fulfillmentMode && existing.fulfillmentMode !== input.fulfillmentMode)
      ) throw new CheckoutIdempotencyConflictError();
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          fulfillmentMode: input.fulfillmentMode,
          orderproCapacityHoldId: input.orderproCapacityHoldId,
          fulfillmentContext: toPrismaJson(input.fulfillmentContext),
          expiresAt: input.expiresAt
        }
      });
      return toCapacityRecord(updated);
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Capacity checkout reservation", { cause: error });
    }
  },

  async recordCapacityHostedCheckout(input) {
    try {
      const existing = await getPrismaClient().checkoutAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      if (
        !existing.orderproCapacityHoldId ||
        !existing.fulfillmentMode || existing.fulfillmentMode === "SHIPPING" ||
        (existing.squareOrderId && existing.squareOrderId !== input.squareOrderId) ||
        (existing.squarePaymentLinkId && existing.squarePaymentLinkId !== input.squarePaymentLinkId)
      ) throw new CheckoutIdempotencyConflictError();
      const updated = await getPrismaClient().checkoutAttempt.update({
        where: { id: input.attemptId },
        data: {
          squareOrderId: input.squareOrderId,
          squarePaymentLinkId: input.squarePaymentLinkId,
          hostedCheckoutCreatedAt: existing.hostedCheckoutCreatedAt ?? new Date()
        }
      });
      return toCapacityRecord(updated);
    } catch (error) {
      if (error instanceof CheckoutIdempotencyConflictError) throw error;
      throw new PersistenceUnavailableError("Capacity hosted checkout correlation", { cause: error });
    }
  },

  async findCapacityCheckout(attemptId) {
    try {
      const record = await getPrismaClient().checkoutAttempt.findUnique({ where: { id: attemptId } });
      if (!record || !record.orderproCapacityHoldId || record.fulfillmentMode === "SHIPPING") return null;
      return toCapacityRecord(record);
    } catch (error) {
      throw new PersistenceUnavailableError("Capacity checkout correlation", { cause: error });
    }
  },

  async listExpiredCapacityCheckouts(input) {
    try {
      const records = await getPrismaClient().checkoutAttempt.findMany({
        where: {
          fulfillmentMode: { in: ["PICKUP", "LOCAL_DELIVERY"] },
          status: "VALIDATED",
          expiresAt: { lte: input.now ?? new Date() },
          squarePaymentLinkId: { not: null },
          orderproCapacityHoldId: { not: null }
        },
        orderBy: { expiresAt: "asc" },
        take: Math.min(100, Math.max(1, input.limit ?? 25))
      });
      return records.map(toCapacityRecord);
    } catch (error) {
      throw new PersistenceUnavailableError("Expired capacity checkouts", { cause: error });
    }
  },

  async markCapacityCheckoutExpired(attemptId) {
    try {
      await getPrismaClient().checkoutAttempt.updateMany({
        where: { id: attemptId, fulfillmentMode: { in: ["PICKUP", "LOCAL_DELIVERY"] }, status: "VALIDATED" },
        data: { status: "EXPIRED" }
      });
    } catch (error) {
      throw new PersistenceUnavailableError("Expired capacity checkout", { cause: error });
    }
  },

  async markCapacityCheckoutCompleted(input) {
    try {
      await getPrismaClient().checkoutAttempt.updateMany({
        where: { id: input.attemptId, fulfillmentMode: { in: ["PICKUP", "LOCAL_DELIVERY"] }, status: "VALIDATED" },
        data: { status: "COMPLETED", squarePaymentId: input.squarePaymentId }
      });
    } catch (error) {
      throw new PersistenceUnavailableError("Completed capacity checkout", { cause: error });
    }
  }
};

function toShippingRecord(record: {
  id: string;
  requestHash: string;
  quote: unknown;
  expiresAt: Date;
  fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING" | null;
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
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
    orderproShippingOrderId: record.orderproShippingOrderId,
    shippingContext: record.shippingContext
  };
}

function toCapacityRecord(record: {
  id: string;
  requestHash: string;
  quote: unknown;
  expiresAt: Date;
  fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING" | null;
  squareOrderId: string | null;
  squarePaymentLinkId: string | null;
  squarePaymentId: string | null;
  orderproCapacityHoldId: string | null;
  fulfillmentContext: unknown;
}): CapacityCheckoutRecord {
  if (
    !record.orderproCapacityHoldId ||
    (record.fulfillmentMode !== "PICKUP" && record.fulfillmentMode !== "LOCAL_DELIVERY")
  ) throw new Error("Checkout attempt is not a correlated capacity checkout.");
  return {
    attemptId: record.id,
    requestHash: record.requestHash,
    quote: record.quote as CartQuote,
    expiresAt: record.expiresAt,
    fulfillmentMode: record.fulfillmentMode,
    squareOrderId: record.squareOrderId,
    squarePaymentLinkId: record.squarePaymentLinkId,
    squarePaymentId: record.squarePaymentId,
    orderproCapacityHoldId: record.orderproCapacityHoldId,
    fulfillmentContext: record.fulfillmentContext
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
