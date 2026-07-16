import { describe, expect, it, vi } from "vitest";
import {
  CapacityHoldConflictError,
  InvalidCapacityHoldRequestError,
  SlotCapacityUnavailableError,
  SlotOccurrenceUnavailableError,
  reserveCapacityHold,
  type CapacityHoldTransactionRunner,
  type ReserveCapacityHoldInput
} from "@/server/fulfillment/capacity-hold-repository";

const now = new Date("2026-07-16T13:00:00.000Z");
const startsAt = new Date("2026-07-16T16:00:00.000Z");

const baseInput: ReserveCapacityHoldInput = {
  slotOccurrenceId: "occurrence-1",
  owner: { kind: "cart", cartId: "cart-1" },
  capacityPoints: 3,
  holdTtlMinutes: 15,
  now
};

function createHarness(options: {
  occurrence?: { id: string; active: boolean; startsAt: Date; capacityPoints: number } | null;
  existing?: { id: string; status: "ACTIVE" | "CONFIRMED"; capacityPoints: number; expiresAt: Date } | null;
  usedCapacityPoints?: number;
} = {}) {
  const slotFindUnique = vi.fn().mockResolvedValue(options.occurrence === undefined
    ? { id: "occurrence-1", active: true, startsAt, capacityPoints: 10 }
    : options.occurrence);
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const findFirst = vi.fn().mockResolvedValue(options.existing ?? null);
  const aggregate = vi.fn().mockResolvedValue({ _sum: { capacityPoints: options.usedCapacityPoints ?? 4 } });
  const create = vi.fn().mockResolvedValue({
    id: "hold-1",
    status: "ACTIVE",
    capacityPoints: baseInput.capacityPoints,
    expiresAt: new Date("2026-07-16T13:15:00.000Z")
  });
  const transaction = {
    slotOccurrence: { findUnique: slotFindUnique },
    capacityHold: { updateMany, findFirst, aggregate, create }
  };
  const transactionRunner = vi.fn(async (operation: (value: never) => Promise<unknown>) => operation(transaction as never));
  const runner = { $transaction: transactionRunner } as unknown as CapacityHoldTransactionRunner;

  return { runner, transactionRunner, slotFindUnique, updateMany, findFirst, aggregate, create, transaction };
}

describe("capacity hold repository", () => {
  it("reserves capacity in a serializable transaction and expires stale holds first", async () => {
    const harness = createHarness();

    await expect(reserveCapacityHold(baseInput, harness.runner)).resolves.toEqual({
      holdId: "hold-1",
      status: "ACTIVE",
      capacityPoints: 3,
      expiresAt: new Date("2026-07-16T13:15:00.000Z"),
      remainingCapacityPoints: 3,
      replayed: false
    });
    expect(harness.transactionRunner).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(harness.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ slotOccurrenceId: "occurrence-1", status: "ACTIVE" }),
      data: { status: "EXPIRED", releasedAt: now }
    }));
    expect(harness.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cartId: "cart-1", capacityPoints: 3, status: "ACTIVE" })
    }));
  });

  it("bounds hold expiry at the slot start", async () => {
    const harness = createHarness();
    harness.create.mockImplementation(async (args: { data: { expiresAt: Date } }) => ({
      id: "hold-1",
      status: "ACTIVE",
      capacityPoints: 3,
      expiresAt: args.data.expiresAt
    }));

    const result = await reserveCapacityHold({
      ...baseInput,
      now: new Date("2026-07-16T15:50:00.000Z"),
      holdTtlMinutes: 30
    }, harness.runner);

    expect(result.expiresAt).toEqual(startsAt);
  });

  it("replays an existing live hold for the same owner and capacity", async () => {
    const expiresAt = new Date("2026-07-16T13:15:00.000Z");
    const harness = createHarness({
      existing: { id: "hold-existing", status: "ACTIVE", capacityPoints: 3, expiresAt },
      usedCapacityPoints: 5
    });

    await expect(reserveCapacityHold(baseInput, harness.runner)).resolves.toEqual({
      holdId: "hold-existing",
      status: "ACTIVE",
      capacityPoints: 3,
      expiresAt,
      remainingCapacityPoints: 5,
      replayed: true
    });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects a replay that changes capacity points", async () => {
    const harness = createHarness({
      existing: {
        id: "hold-existing",
        status: "ACTIVE",
        capacityPoints: 4,
        expiresAt: new Date("2026-07-16T13:15:00.000Z")
      }
    });

    await expect(reserveCapacityHold(baseInput, harness.runner)).rejects.toBeInstanceOf(CapacityHoldConflictError);
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects missing, inactive, or started occurrences", async () => {
    await expect(reserveCapacityHold(baseInput, createHarness({ occurrence: null }).runner)).rejects.toBeInstanceOf(SlotOccurrenceUnavailableError);
    await expect(reserveCapacityHold(baseInput, createHarness({
      occurrence: { id: "occurrence-1", active: false, startsAt, capacityPoints: 10 }
    }).runner)).rejects.toBeInstanceOf(SlotOccurrenceUnavailableError);
    await expect(reserveCapacityHold(baseInput, createHarness({
      occurrence: { id: "occurrence-1", active: true, startsAt: now, capacityPoints: 10 }
    }).runner)).rejects.toBeInstanceOf(SlotOccurrenceUnavailableError);
  });

  it("rejects an over-capacity reservation with the remaining points", async () => {
    const harness = createHarness({ usedCapacityPoints: 8 });

    await expect(reserveCapacityHold(baseInput, harness.runner)).rejects.toMatchObject({
      name: "SlotCapacityUnavailableError",
      remainingCapacityPoints: 2
    });
    expect(harness.create).not.toHaveBeenCalled();
    expect(new SlotCapacityUnavailableError(2).remainingCapacityPoints).toBe(2);
  });

  it("retries a serialization conflict before creating the hold", async () => {
    const harness = createHarness();
    let attempt = 0;
    const runner: CapacityHoldTransactionRunner = {
      async $transaction(operation) {
        attempt += 1;
        if (attempt === 1) throw { code: "P2034" };
        return operation(harness.transaction as never);
      }
    };

    await expect(reserveCapacityHold(baseInput, runner)).resolves.toMatchObject({ holdId: "hold-1", replayed: false });
    expect(attempt).toBe(2);
  });

  it("rejects invalid requests before opening a transaction", async () => {
    const harness = createHarness();

    await expect(reserveCapacityHold({ ...baseInput, capacityPoints: 0 }, harness.runner)).rejects.toBeInstanceOf(InvalidCapacityHoldRequestError);
    await expect(reserveCapacityHold({ ...baseInput, holdTtlMinutes: 0 }, harness.runner)).rejects.toBeInstanceOf(InvalidCapacityHoldRequestError);
    await expect(reserveCapacityHold({ ...baseInput, owner: { kind: "cart", cartId: "" } }, harness.runner)).rejects.toBeInstanceOf(InvalidCapacityHoldRequestError);
    expect(harness.transactionRunner).not.toHaveBeenCalled();
  });
});
