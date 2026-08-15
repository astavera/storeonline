/**
 * Implements server-side delivery zone repository behavior and persistence boundaries.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import {
  isValidDeliveryGeometry,
  type DeliveryGeometry,
  type DeliveryRateRulePolicy,
  type DeliveryZonePolicy
} from "@/features/fulfillment/services/delivery-zone-service";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

type ActiveRateRuleRecord = {
  id: string;
  active: boolean;
  priority: number;
  feeCents: number;
  minimumSubtotalCents: number | null;
  maximumSubtotalCents: number | null;
};

type ActiveZoneVersionRecord = {
  id: string;
  polygonGeojson: unknown;
  baseFeeCents: number;
  minimumOrderCents: number;
  maxDistanceMiles: unknown;
  maxRouteMinutes: number | null;
  priority: number;
  activeDays: string[];
  rateRules: ActiveRateRuleRecord[];
};

type ActiveZoneRecord = {
  id: string;
  locationId: string;
  active: boolean;
  versions: ActiveZoneVersionRecord[];
};

export type DeliveryZoneReadClient = {
  deliveryZone: {
    findMany(args: unknown): Promise<ActiveZoneRecord[]>;
  };
};

type DeliveryZoneVersionTransaction = {
  deliveryZone: {
    findUnique(args: unknown): Promise<{ id: string; locationId: string; active: boolean } | null>;
  };
  deliveryZoneVersion: {
    findFirst(args: unknown): Promise<{ id?: string; versionNumber?: number } | null>;
    create(args: unknown): Promise<{ id: string; versionNumber: number }>;
  };
};

export type DeliveryZoneVersionTransactionRunner = {
  $transaction<T>(
    operation: (transaction: DeliveryZoneVersionTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" }
  ): Promise<T>;
};

export type DeliveryRateRuleVersionInput = {
  name: string;
  minimumSubtotalCents?: number | null;
  maximumSubtotalCents?: number | null;
  feeCents: number;
  priority?: number;
  active?: boolean;
};

export type AppendDeliveryZoneVersionInput = {
  deliveryZoneId: string;
  geometry: DeliveryGeometry;
  serviceMode: string;
  baseFeeCents: number;
  minimumOrderCents: number;
  maxDistanceMiles?: number | null;
  maxRouteMinutes?: number | null;
  priority: number;
  activeDays: readonly string[];
  cutoffMinutes: number;
  leadTimeMinutes: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  rateRules?: readonly DeliveryRateRuleVersionInput[];
};

export class InvalidDeliveryZoneVersionError extends Error {
  constructor() {
    super("The delivery zone version is invalid.");
    this.name = "InvalidDeliveryZoneVersionError";
  }
}

export class DeliveryZoneUnavailableError extends Error {
  constructor() {
    super("The delivery zone is missing or inactive.");
    this.name = "DeliveryZoneUnavailableError";
  }
}

export class DeliveryZoneVersionConflictError extends Error {
  constructor() {
    super("The delivery zone version overlaps an existing effective window.");
    this.name = "DeliveryZoneVersionConflictError";
  }
}

export class InvalidActiveDeliveryZoneError extends Error {
  constructor() {
    super("The active delivery zone configuration is ambiguous or invalid.");
    this.name = "InvalidActiveDeliveryZoneError";
  }
}

export async function readActiveDeliveryZonePolicies(
  input: { locationId: string; at?: Date },
  client: DeliveryZoneReadClient = getPrismaClient() as unknown as DeliveryZoneReadClient
): Promise<DeliveryZonePolicy[]> {
  const at = input.at ?? new Date();
  if (input.locationId.length === 0 || !isValidDate(at)) throw new InvalidActiveDeliveryZoneError();

  try {
    const records = await client.deliveryZone.findMany({
      where: { locationId: input.locationId, active: true },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
      select: {
        id: true,
        locationId: true,
        active: true,
        versions: {
          where: {
            effectiveFrom: { lte: at },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
          },
          orderBy: [{ effectiveFrom: "desc" }, { versionNumber: "desc" }],
          take: 2,
          select: {
            id: true,
            polygonGeojson: true,
            baseFeeCents: true,
            minimumOrderCents: true,
            maxDistanceMiles: true,
            maxRouteMinutes: true,
            priority: true,
            activeDays: true,
            rateRules: {
              where: { active: true },
              orderBy: [{ priority: "desc" }, { id: "asc" }],
              select: {
                id: true,
                active: true,
                priority: true,
                feeCents: true,
                minimumSubtotalCents: true,
                maximumSubtotalCents: true
              }
            }
          }
        }
      }
    });

    return records.flatMap((record) => {
      if (record.versions.length === 0) return [];
      if (record.versions.length !== 1) throw new InvalidActiveDeliveryZoneError();
      return [mapActiveZone(record, record.versions[0])];
    });
  } catch (error) {
    if (error instanceof InvalidActiveDeliveryZoneError) throw error;
    throw new PersistenceUnavailableError("Delivery zone", { cause: error });
  }
}

export async function appendDeliveryZoneVersion(
  input: AppendDeliveryZoneVersionInput,
  runner: DeliveryZoneVersionTransactionRunner = getPrismaClient() as unknown as DeliveryZoneVersionTransactionRunner,
  maxAttempts = 3
) {
  if (!isValidVersionInput(input) || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new InvalidDeliveryZoneVersionError();
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runner.$transaction(async (transaction) => {
        const zone = await transaction.deliveryZone.findUnique({
          where: { id: input.deliveryZoneId },
          select: { id: true, locationId: true, active: true }
        });
        if (!zone || !zone.active) throw new DeliveryZoneUnavailableError();

        const overlap = await transaction.deliveryZoneVersion.findFirst({
          where: overlappingEffectiveWindow(input),
          select: { id: true }
        });
        if (overlap) throw new DeliveryZoneVersionConflictError();

        const latest = await transaction.deliveryZoneVersion.findFirst({
          where: { deliveryZoneId: input.deliveryZoneId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true }
        });
        const versionNumber = (latest?.versionNumber ?? 0) + 1;
        return transaction.deliveryZoneVersion.create({
          data: {
            deliveryZoneId: input.deliveryZoneId,
            versionNumber,
            polygonGeojson: toPrismaJson(input.geometry),
            serviceMode: input.serviceMode,
            baseFeeCents: input.baseFeeCents,
            minimumOrderCents: input.minimumOrderCents,
            maxDistanceMiles: input.maxDistanceMiles ?? null,
            maxRouteMinutes: input.maxRouteMinutes ?? null,
            priority: input.priority,
            activeDays: [...input.activeDays],
            cutoffMinutes: input.cutoffMinutes,
            leadTimeMinutes: input.leadTimeMinutes,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            rateRules: {
              create: (input.rateRules ?? []).map((rule) => ({
                name: rule.name,
                minimumSubtotalCents: rule.minimumSubtotalCents ?? null,
                maximumSubtotalCents: rule.maximumSubtotalCents ?? null,
                feeCents: rule.feeCents,
                priority: rule.priority ?? 0,
                active: rule.active ?? true
              }))
            }
          },
          select: { id: true, versionNumber: true }
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isDeliveryZoneDomainError(error)) throw error;
      if (attempt < maxAttempts && isRetryableWriteConflict(error)) continue;
      throw new PersistenceUnavailableError("Delivery zone", { cause: error });
    }
  }

  throw new PersistenceUnavailableError("Delivery zone");
}

function mapActiveZone(record: ActiveZoneRecord, version: ActiveZoneVersionRecord): DeliveryZonePolicy {
  if (!isValidDeliveryGeometry(version.polygonGeojson)) throw new InvalidActiveDeliveryZoneError();
  const maxDistanceMiles = optionalDecimalToNumber(version.maxDistanceMiles);
  if (maxDistanceMiles === undefined) throw new InvalidActiveDeliveryZoneError();

  return {
    id: record.id,
    locationId: record.locationId,
    versionId: version.id,
    active: record.active,
    priority: version.priority,
    activeDays: version.activeDays,
    geometry: version.polygonGeojson,
    baseFeeCents: version.baseFeeCents,
    minimumOrderCents: version.minimumOrderCents,
    maxDistanceMiles,
    maxRouteMinutes: version.maxRouteMinutes,
    rateRules: version.rateRules.map(mapRateRule)
  };
}

function mapRateRule(rule: ActiveRateRuleRecord): DeliveryRateRulePolicy {
  return {
    id: rule.id,
    active: rule.active,
    priority: rule.priority,
    feeCents: rule.feeCents,
    minimumSubtotalCents: rule.minimumSubtotalCents,
    maximumSubtotalCents: rule.maximumSubtotalCents
  };
}

function overlappingEffectiveWindow(input: AppendDeliveryZoneVersionInput) {
  return {
    deliveryZoneId: input.deliveryZoneId,
    effectiveFrom: input.effectiveTo ? { lt: input.effectiveTo } : undefined,
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }]
  };
}

function isValidVersionInput(input: AppendDeliveryZoneVersionInput) {
  return input.deliveryZoneId.length > 0
    && input.serviceMode.length > 0
    && isValidDeliveryGeometry(input.geometry)
    && isNonnegativeInteger(input.baseFeeCents)
    && isNonnegativeInteger(input.minimumOrderCents)
    && isOptionalNonnegativeNumber(input.maxDistanceMiles)
    && (input.maxRouteMinutes == null || isNonnegativeInteger(input.maxRouteMinutes))
    && Number.isInteger(input.priority)
    && input.activeDays.length > 0
    && input.activeDays.every((day) => day.length > 0)
    && isNonnegativeInteger(input.cutoffMinutes)
    && isNonnegativeInteger(input.leadTimeMinutes)
    && isValidDate(input.effectiveFrom)
    && (input.effectiveTo == null
      || (isValidDate(input.effectiveTo) && input.effectiveFrom.getTime() < input.effectiveTo.getTime()))
    && (input.rateRules ?? []).every(isValidRateRuleInput);
}

function isValidRateRuleInput(rule: DeliveryRateRuleVersionInput) {
  return rule.name.length > 0
    && isNonnegativeInteger(rule.feeCents)
    && (rule.minimumSubtotalCents == null || isNonnegativeInteger(rule.minimumSubtotalCents))
    && (rule.maximumSubtotalCents == null || isNonnegativeInteger(rule.maximumSubtotalCents))
    && (rule.minimumSubtotalCents == null
      || rule.maximumSubtotalCents == null
      || rule.minimumSubtotalCents <= rule.maximumSubtotalCents)
    && (rule.priority == null || Number.isInteger(rule.priority));
}

function optionalDecimalToNumber(value: unknown): number | null | undefined {
  if (value == null) return null;
  const numberValue = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function"
        ? value.toNumber()
        : Number.NaN;
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function isDeliveryZoneDomainError(error: unknown) {
  return error instanceof InvalidDeliveryZoneVersionError
    || error instanceof DeliveryZoneUnavailableError
    || error instanceof DeliveryZoneVersionConflictError;
}

function isRetryableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2002" || error.code === "P2034"
    : Boolean(error && typeof error === "object" && "code" in error
      && (error.code === "P2002" || error.code === "P2034"));
}

function isValidDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isOptionalNonnegativeNumber(value: number | null | undefined) {
  return value == null || (Number.isFinite(value) && value >= 0);
}

function isNonnegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}
