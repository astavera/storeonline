import "server-only";

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

export type CapacityHoldOwner =
  | { kind: "cart"; cartId: string }
  | { kind: "checkout-attempt"; checkoutAttemptId: string }
  | { kind: "order"; orderId: string };

export type ReserveCapacityHoldInput = {
  slotOccurrenceId: string;
  owner: CapacityHoldOwner;
  capacityPoints: number;
  holdTtlMinutes: number;
  now?: Date;
};

export type CapacityHoldReservation = {
  holdId: string;
  status: "ACTIVE" | "CONFIRMED";
  capacityPoints: number;
  expiresAt: Date;
  remainingCapacityPoints: number;
  replayed: boolean;
};

type CapacityHoldRecord = {
  id: string;
  status: "ACTIVE" | "CONFIRMED";
  capacityPoints: number;
  expiresAt: Date;
};

type CapacityHoldTransaction = {
  slotOccurrence: {
    findUnique(args: unknown): Promise<{
      id: string;
      active: boolean;
      startsAt: Date;
      capacityPoints: number;
    } | null>;
  };
  capacityHold: {
    updateMany(args: unknown): Promise<{ count: number }>;
    findFirst(args: unknown): Promise<CapacityHoldRecord | null>;
    aggregate(args: unknown): Promise<{ _sum: { capacityPoints: number | null } }>;
    create(args: unknown): Promise<CapacityHoldRecord>;
  };
};

export type CapacityHoldTransactionRunner = {
  $transaction<T>(
    operation: (transaction: CapacityHoldTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" }
  ): Promise<T>;
};

export class InvalidCapacityHoldRequestError extends Error {
  constructor() {
    super("Capacity hold input is invalid.");
    this.name = "InvalidCapacityHoldRequestError";
  }
}

export class SlotOccurrenceUnavailableError extends Error {
  constructor() {
    super("The slot occurrence is missing, inactive, or already started.");
    this.name = "SlotOccurrenceUnavailableError";
  }
}

export class SlotCapacityUnavailableError extends Error {
  readonly remainingCapacityPoints: number;

  constructor(remainingCapacityPoints: number) {
    super("The slot occurrence does not have enough remaining capacity.");
    this.name = "SlotCapacityUnavailableError";
    this.remainingCapacityPoints = remainingCapacityPoints;
  }
}

export class CapacityHoldConflictError extends Error {
  constructor() {
    super("The same owner already has a hold with different capacity points.");
    this.name = "CapacityHoldConflictError";
  }
}

export async function reserveCapacityHold(
  input: ReserveCapacityHoldInput,
  runner: CapacityHoldTransactionRunner = getPrismaClient() as unknown as CapacityHoldTransactionRunner,
  maxAttempts = 3
) {
  const now = input.now ?? new Date();
  if (!isValidInput(input, now) || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new InvalidCapacityHoldRequestError();
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runner.$transaction(
        (transaction) => reserveInTransaction(transaction, input, now),
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      if (isDomainError(error)) throw error;
      if (attempt < maxAttempts && isRetryableWriteConflict(error)) continue;
      throw new PersistenceUnavailableError("Capacity hold", { cause: error });
    }
  }

  throw new PersistenceUnavailableError("Capacity hold");
}

async function reserveInTransaction(
  transaction: CapacityHoldTransaction,
  input: ReserveCapacityHoldInput,
  now: Date
): Promise<CapacityHoldReservation> {
  const occurrence = await transaction.slotOccurrence.findUnique({
    where: { id: input.slotOccurrenceId },
    select: { id: true, active: true, startsAt: true, capacityPoints: true }
  });
  if (!occurrence || !occurrence.active || now.getTime() >= occurrence.startsAt.getTime()) {
    throw new SlotOccurrenceUnavailableError();
  }

  await transaction.capacityHold.updateMany({
    where: {
      slotOccurrenceId: occurrence.id,
      status: "ACTIVE",
      expiresAt: { lte: now }
    },
    data: { status: "EXPIRED", releasedAt: now }
  });

  const ownerWhere = capacityHoldOwnerData(input.owner);
  const existing = await transaction.capacityHold.findFirst({
    where: {
      slotOccurrenceId: occurrence.id,
      ...ownerWhere,
      OR: [
        { status: "ACTIVE", expiresAt: { gt: now } },
        { status: "CONFIRMED" }
      ]
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, capacityPoints: true, expiresAt: true }
  });

  const aggregate = await transaction.capacityHold.aggregate({
    where: {
      slotOccurrenceId: occurrence.id,
      OR: [
        { status: "ACTIVE", expiresAt: { gt: now } },
        { status: "CONFIRMED" }
      ]
    },
    _sum: { capacityPoints: true }
  });
  const usedCapacityPoints = aggregate._sum.capacityPoints ?? 0;
  const remainingCapacityPoints = Math.max(0, occurrence.capacityPoints - usedCapacityPoints);

  if (existing) {
    if (existing.capacityPoints !== input.capacityPoints) throw new CapacityHoldConflictError();
    return {
      holdId: existing.id,
      status: existing.status,
      capacityPoints: existing.capacityPoints,
      expiresAt: existing.expiresAt,
      remainingCapacityPoints,
      replayed: true
    };
  }

  if (input.capacityPoints > remainingCapacityPoints) {
    throw new SlotCapacityUnavailableError(remainingCapacityPoints);
  }

  const requestedExpiry = new Date(now.getTime() + input.holdTtlMinutes * 60_000);
  const expiresAt = new Date(Math.min(requestedExpiry.getTime(), occurrence.startsAt.getTime()));
  const created = await transaction.capacityHold.create({
    data: {
      slotOccurrenceId: occurrence.id,
      ...ownerWhere,
      status: "ACTIVE",
      capacityPoints: input.capacityPoints,
      expiresAt
    },
    select: { id: true, status: true, capacityPoints: true, expiresAt: true }
  });

  return {
    holdId: created.id,
    status: created.status,
    capacityPoints: created.capacityPoints,
    expiresAt: created.expiresAt,
    remainingCapacityPoints: remainingCapacityPoints - created.capacityPoints,
    replayed: false
  };
}

function capacityHoldOwnerData(owner: CapacityHoldOwner) {
  if (owner.kind === "cart") return { cartId: owner.cartId };
  if (owner.kind === "checkout-attempt") return { checkoutAttemptId: owner.checkoutAttemptId };
  return { orderId: owner.orderId };
}

function isValidInput(input: ReserveCapacityHoldInput, now: Date) {
  return input.slotOccurrenceId.length > 0
    && ownerId(input.owner).length > 0
    && Number.isInteger(input.capacityPoints)
    && input.capacityPoints > 0
    && Number.isInteger(input.holdTtlMinutes)
    && input.holdTtlMinutes > 0
    && Number.isFinite(now.getTime());
}

function ownerId(owner: CapacityHoldOwner) {
  if (owner.kind === "cart") return owner.cartId;
  if (owner.kind === "checkout-attempt") return owner.checkoutAttemptId;
  return owner.orderId;
}

function isDomainError(error: unknown) {
  return error instanceof InvalidCapacityHoldRequestError
    || error instanceof SlotOccurrenceUnavailableError
    || error instanceof SlotCapacityUnavailableError
    || error instanceof CapacityHoldConflictError;
}

function isRetryableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2034"
    : Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}
