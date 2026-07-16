import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SlotCapacityUnavailableError,
  confirmCapacityHold,
  releaseCapacityHold,
  reserveCapacityHold,
  type CapacityHoldTransactionRunner
} from "@/server/fulfillment/capacity-hold-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe.sequential : describe.skip;

describePostgres("PostgreSQL capacity hold concurrency", () => {
  const suffix = randomUUID();
  const locationId = `test-location-${suffix}`;
  const templateId = `test-template-${suffix}`;
  const occurrenceId = `test-occurrence-${suffix}`;
  const cartIds = [`test-cart-a-${suffix}`, `test-cart-b-${suffix}`] as const;
  const now = new Date();
  const startsAt = new Date(now.getTime() + 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required.");
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    await prisma.storeLocation.create({
      data: {
        id: locationId,
        slug: locationId,
        name: "Disposable integration-test store",
        address: "Test-only address",
        pickupEnabled: true,
        localDeliveryEnabled: true,
        shippingFulfillmentEnabled: false
      }
    });
    await prisma.slotTemplate.create({
      data: {
        id: templateId,
        locationId,
        fulfillmentMode: "PICKUP",
        dayOfWeek: 4,
        startTime: "12:00",
        endTime: "13:00",
        capacityPoints: 5,
        active: true,
        cutoffMinutes: 30,
        leadTimeMinutes: 60
      }
    });
    await prisma.slotOccurrence.create({
      data: {
        id: occurrenceId,
        slotTemplateId: templateId,
        startsAt,
        endsAt,
        capacityPoints: 5,
        active: true
      }
    });
    await prisma.cart.createMany({
      data: cartIds.map((id, index) => ({ id, sessionId: `test-session-${index}-${suffix}` }))
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.capacityHold.deleteMany({ where: { slotOccurrenceId: occurrenceId } });
    await prisma.slotOccurrence.deleteMany({ where: { id: occurrenceId } });
    await prisma.slotTemplate.deleteMany({ where: { id: templateId } });
    await prisma.cart.deleteMany({ where: { id: { in: [...cartIds] } } });
    await prisma.storeLocation.deleteMany({ where: { id: locationId } });
    await prisma.$disconnect();
  });

  it("allows only one of two competing reservations to consume a five-point slot", async () => {
    const runner = prisma as unknown as CapacityHoldTransactionRunner;
    const results = await Promise.allSettled(cartIds.map((cartId) => reserveCapacityHold({
      slotOccurrenceId: occurrenceId,
      owner: { kind: "cart", cartId },
      capacityPoints: 3,
      holdTtlMinutes: 15,
      now
    }, runner, 5)));

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotCapacityUnavailableError);

    const aggregate = await prisma.capacityHold.aggregate({
      where: {
        slotOccurrenceId: occurrenceId,
        status: { in: ["ACTIVE", "CONFIRMED"] }
      },
      _sum: { capacityPoints: true }
    });
    expect(aggregate._sum.capacityPoints).toBe(3);

    const reservation = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveCapacityHold>>>).value;
    const winningCartId = cartIds.find((cartId) => results[cartIds.indexOf(cartId)].status === "fulfilled");
    expect(winningCartId).toBeDefined();
    if (!winningCartId) throw new Error("A winning cart is required.");
    const owner = { kind: "cart" as const, cartId: winningCartId };
    const confirmedAt = new Date(now.getTime() + 5_000);
    const releasedAt = new Date(now.getTime() + 10_000);

    await expect(confirmCapacityHold({ holdId: reservation.holdId, owner, now: confirmedAt }, runner)).resolves.toMatchObject({
      status: "CONFIRMED",
      replayed: false
    });
    await expect(confirmCapacityHold({ holdId: reservation.holdId, owner, now: confirmedAt }, runner)).resolves.toMatchObject({
      status: "CONFIRMED",
      replayed: true
    });
    await expect(releaseCapacityHold({ holdId: reservation.holdId, owner, now: releasedAt }, runner)).resolves.toMatchObject({
      status: "RELEASED",
      replayed: false
    });
    await expect(releaseCapacityHold({ holdId: reservation.holdId, owner, now: releasedAt }, runner)).resolves.toMatchObject({
      status: "RELEASED",
      replayed: true
    });

    const liveAfterRelease = await prisma.capacityHold.aggregate({
      where: {
        slotOccurrenceId: occurrenceId,
        status: { in: ["ACTIVE", "CONFIRMED"] }
      },
      _sum: { capacityPoints: true }
    });
    expect(liveAfterRelease._sum.capacityPoints).toBeNull();
  });
});
