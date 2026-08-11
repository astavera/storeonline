/**
 * Verifies integration behavior for postgres fulfillment persistence.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  hashAddressIdentity,
  recordAddressEvaluation,
  type AddressEvaluationClient
} from "@/server/fulfillment/address-evaluation-repository";
import {
  appendDeliveryZoneVersion,
  readActiveDeliveryZonePolicies,
  type DeliveryZoneReadClient,
  type DeliveryZoneVersionTransactionRunner
} from "@/server/fulfillment/delivery-zone-repository";
import {
  generateSlotOccurrences,
  type SlotOccurrenceClient
} from "@/server/fulfillment/slot-occurrence-generator";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe.sequential : describe.skip;

describePostgres("PostgreSQL fulfillment persistence", () => {
  const suffix = randomUUID();
  const locationId = `test-location-${suffix}`;
  const zoneId = `test-zone-${suffix}`;
  const templateId = `test-template-${suffix}`;
  const hashSecret = "postgres-integration-address-hash-secret-32-bytes";
  const address = {
    addressLine1: "500 E 80th St",
    addressLine2: "Apt 12B",
    locality: "New York",
    administrativeArea: "NY",
    postalCode: "10075",
    country: "US"
  };
  const geometry = {
    type: "Polygon" as const,
    coordinates: [[
      [-73.96, 40.77] as const,
      [-73.94, 40.77] as const,
      [-73.94, 40.79] as const,
      [-73.96, 40.77] as const
    ]]
  };
  let prisma: PrismaClient;
  let zoneVersionId: string;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required.");
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    await prisma.storeLocation.create({
      data: {
        id: locationId,
        slug: locationId,
        name: "Phase 2 disposable store",
        address: "Test only",
        localDeliveryEnabled: true
      }
    });
    await prisma.deliveryZone.create({
      data: {
        id: zoneId,
        locationId,
        name: "Phase 2 disposable zone",
        polygonGeojson: geometry,
        version: 1,
        active: true,
        serviceMode: "WALKING",
        baseFeeCents: 9999,
        minimumOrderCents: 9999,
        maxDistanceMiles: 99,
        maxRouteMinutes: 999,
        priority: -999,
        activeDays: ["MONDAY"],
        cutoffMinutes: 0,
        leadTimeMinutes: 0
      }
    });
    await prisma.slotTemplate.create({
      data: {
        id: templateId,
        locationId,
        fulfillmentMode: "LOCAL_DELIVERY",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
        capacityPoints: 7,
        active: true,
        cutoffMinutes: 30,
        leadTimeMinutes: 60
      }
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.addressEvaluation.deleteMany({ where: { zoneVersion: { deliveryZoneId: zoneId } } });
    await prisma.deliveryRateRule.deleteMany({ where: { zoneVersion: { deliveryZoneId: zoneId } } });
    await prisma.deliveryZoneVersion.deleteMany({ where: { deliveryZoneId: zoneId } });
    await prisma.slotOccurrence.deleteMany({ where: { slotTemplateId: templateId } });
    await prisma.slotTemplate.deleteMany({ where: { id: templateId } });
    await prisma.deliveryZone.deleteMany({ where: { id: zoneId } });
    await prisma.storeLocation.deleteMany({ where: { id: locationId } });
    await prisma.$disconnect();
  });

  it("persists a complete version snapshot and ignores later mutable zone changes", async () => {
    const created = await appendDeliveryZoneVersion({
      deliveryZoneId: zoneId,
      geometry,
      serviceMode: "WALKING",
      baseFeeCents: 1000,
      minimumOrderCents: 2500,
      maxDistanceMiles: 1.25,
      maxRouteMinutes: 25,
      priority: 10,
      activeDays: ["MONDAY"],
      cutoffMinutes: 45,
      leadTimeMinutes: 90,
      effectiveFrom: new Date("2026-07-20T00:00:00.000Z"),
      effectiveTo: new Date("2026-08-20T00:00:00.000Z"),
      rateRules: [{ name: "Large order", minimumSubtotalCents: 10000, feeCents: 500, priority: 20 }]
    }, prisma as unknown as DeliveryZoneVersionTransactionRunner);
    zoneVersionId = created.id;

    await prisma.deliveryZone.update({
      where: { id: zoneId },
      data: { baseFeeCents: 8888, minimumOrderCents: 8888, maxDistanceMiles: 88, maxRouteMinutes: 888, priority: -888 }
    });
    const policies = await readActiveDeliveryZonePolicies({
      locationId,
      at: new Date("2026-07-20T16:00:00.000Z")
    }, prisma as unknown as DeliveryZoneReadClient);

    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      versionId: created.id,
      baseFeeCents: 1000,
      minimumOrderCents: 2500,
      maxDistanceMiles: 1.25,
      maxRouteMinutes: 25,
      priority: 10,
      rateRules: [{ feeCents: 500, priority: 20 }]
    });
  });

  it("stores a keyed hash and no street-level PII in AddressEvaluation", async () => {
    const evaluation = await recordAddressEvaluation({
      address,
      hashSecret,
      source: "POSTGRES_INTEGRATION",
      locationId,
      zoneVersionId,
      eligible: true,
      reasonCode: "ELIGIBLE",
      feeCents: 1000,
      distanceMiles: 0.7,
      routeMinutes: 12,
      cacheTtlMinutes: 15,
      evaluatedAt: new Date("2026-07-20T16:00:00.000Z")
    }, prisma as unknown as AddressEvaluationClient);
    const stored = await prisma.addressEvaluation.findUniqueOrThrow({ where: { id: evaluation.id } });

    expect(stored.addressHash).toBe(hashAddressIdentity(address, hashSecret));
    expect(JSON.stringify(stored.input)).not.toMatch(/500 E 80th|Apt 12B|New York/i);
    expect(stored.expiresAt).toEqual(new Date("2026-07-20T16:15:00.000Z"));
  });

  it("generates occurrences idempotently and preserves their capacity snapshot", async () => {
    const first = await generateSlotOccurrences({
      fromDate: "2026-07-20",
      throughDate: "2026-07-20",
      locationId,
      fulfillmentMode: "LOCAL_DELIVERY"
    }, prisma as unknown as SlotOccurrenceClient);
    expect(first).toMatchObject({ candidateCount: 1, createdCount: 1 });
    expect(first.occurrences[0]).toMatchObject({
      startsAt: new Date("2026-07-20T13:00:00.000Z"),
      capacityPoints: 7
    });

    await prisma.slotTemplate.update({ where: { id: templateId }, data: { capacityPoints: 20 } });
    const replay = await generateSlotOccurrences({
      fromDate: "2026-07-20",
      throughDate: "2026-07-20",
      locationId,
      fulfillmentMode: "LOCAL_DELIVERY"
    }, prisma as unknown as SlotOccurrenceClient);
    expect(replay.createdCount).toBe(0);
    expect(replay.occurrences[0].capacityPoints).toBe(7);
  });
});
