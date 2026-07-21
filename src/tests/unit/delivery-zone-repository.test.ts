import { describe, expect, it, vi } from "vitest";
import {
  appendDeliveryZoneVersion,
  DeliveryZoneVersionConflictError,
  InvalidActiveDeliveryZoneError,
  InvalidDeliveryZoneVersionError,
  readActiveDeliveryZonePolicies,
  type AppendDeliveryZoneVersionInput,
  type DeliveryZoneReadClient,
  type DeliveryZoneVersionTransactionRunner
} from "@/server/fulfillment/delivery-zone-repository";

const geometry = {
  type: "Polygon",
  coordinates: [[
    [-73.96, 40.77],
    [-73.94, 40.77],
    [-73.94, 40.79],
    [-73.96, 40.77]
  ]]
} as const;

const versionInput: AppendDeliveryZoneVersionInput = {
  deliveryZoneId: "zone-1",
  geometry,
  serviceMode: "WALKING",
  baseFeeCents: 1000,
  minimumOrderCents: 2500,
  maxDistanceMiles: 1.25,
  maxRouteMinutes: 25,
  priority: 10,
  activeDays: ["MONDAY", "TUESDAY"],
  cutoffMinutes: 45,
  leadTimeMinutes: 90,
  effectiveFrom: new Date("2026-07-20T04:00:00.000Z"),
  rateRules: [{ name: "Large order", minimumSubtotalCents: 10000, feeCents: 500, priority: 20 }]
};

describe("delivery zone repository", () => {
  it("reads one effective immutable snapshot and its active rate rules", async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: "zone-1",
      locationId: "store-3rd-avenue",
      active: true,
      versions: [{
        id: "zone-version-3",
        polygonGeojson: geometry,
        baseFeeCents: 1000,
        minimumOrderCents: 2500,
        maxDistanceMiles: { toNumber: () => 1.25 },
        maxRouteMinutes: 25,
        priority: 10,
        activeDays: ["MONDAY"],
        rateRules: [{
          id: "rule-1",
          active: true,
          priority: 20,
          feeCents: 500,
          minimumSubtotalCents: 10000,
          maximumSubtotalCents: null
        }]
      }]
    }]);
    const client = { deliveryZone: { findMany } } as DeliveryZoneReadClient;

    await expect(readActiveDeliveryZonePolicies({
      locationId: "store-3rd-avenue",
      at: new Date("2026-07-20T16:00:00.000Z")
    }, client)).resolves.toEqual([{
      id: "zone-1",
      locationId: "store-3rd-avenue",
      versionId: "zone-version-3",
      active: true,
      priority: 10,
      activeDays: ["MONDAY"],
      geometry,
      baseFeeCents: 1000,
      minimumOrderCents: 2500,
      maxDistanceMiles: 1.25,
      maxRouteMinutes: 25,
      rateRules: [{
        id: "rule-1",
        active: true,
        priority: 20,
        feeCents: 500,
        minimumSubtotalCents: 10000,
        maximumSubtotalCents: null
      }]
    }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { locationId: "store-3rd-avenue", active: true },
      select: expect.objectContaining({
        versions: expect.objectContaining({ take: 2 })
      })
    }));
  });

  it("fails closed when effective version windows overlap", async () => {
    const client = {
      deliveryZone: {
        findMany: vi.fn().mockResolvedValue([{
          id: "zone-1",
          locationId: "store-3rd-avenue",
          active: true,
          versions: [{ id: "version-1" }, { id: "version-2" }]
        }])
      }
    } as unknown as DeliveryZoneReadClient;

    await expect(readActiveDeliveryZonePolicies({ locationId: "store-3rd-avenue" }, client))
      .rejects.toBeInstanceOf(InvalidActiveDeliveryZoneError);
  });

  it("appends a monotonic version with route limits and rules in one serializable transaction", async () => {
    const create = vi.fn().mockResolvedValue({ id: "version-3", versionNumber: 3 });
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ versionNumber: 2 });
    const transaction = {
      deliveryZone: { findUnique: vi.fn().mockResolvedValue({ id: "zone-1", locationId: "store-3rd-avenue", active: true }) },
      deliveryZoneVersion: { findFirst, create }
    };
    const transactionRunner = vi.fn(async (operation: (value: never) => Promise<unknown>) => operation(transaction as never));
    const runner = { $transaction: transactionRunner } as unknown as DeliveryZoneVersionTransactionRunner;

    await expect(appendDeliveryZoneVersion(versionInput, runner)).resolves.toEqual({
      id: "version-3",
      versionNumber: 3
    });
    expect(transactionRunner).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        versionNumber: 3,
        maxDistanceMiles: 1.25,
        maxRouteMinutes: 25,
        priority: 10,
        rateRules: { create: [expect.objectContaining({ name: "Large order", feeCents: 500 })] }
      })
    }));
  });

  it("rejects overlapping windows without mutating a historical version", async () => {
    const create = vi.fn();
    const transaction = {
      deliveryZone: { findUnique: vi.fn().mockResolvedValue({ id: "zone-1", locationId: "store-3rd-avenue", active: true }) },
      deliveryZoneVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-version" }),
        create
      }
    };
    const runner = {
      $transaction: (operation: (value: never) => Promise<unknown>) => operation(transaction as never)
    } as unknown as DeliveryZoneVersionTransactionRunner;

    await expect(appendDeliveryZoneVersion(versionInput, runner)).rejects.toBeInstanceOf(DeliveryZoneVersionConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid geometry before opening a transaction", async () => {
    const transactionRunner = vi.fn();
    const runner = { $transaction: transactionRunner } as unknown as DeliveryZoneVersionTransactionRunner;

    await expect(appendDeliveryZoneVersion({
      ...versionInput,
      geometry: { type: "Polygon", coordinates: [] }
    }, runner)).rejects.toBeInstanceOf(InvalidDeliveryZoneVersionError);
    expect(transactionRunner).not.toHaveBeenCalled();
  });
});
