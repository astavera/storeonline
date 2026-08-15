/**
 * Implements server-side address evaluation repository behavior and persistence boundaries.
 */

import "server-only";

import { createHmac } from "node:crypto";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

export type AddressIdentity = {
  addressLine1: string;
  addressLine2?: string | null;
  locality: string;
  administrativeArea: string;
  postalCode: string;
  country: string;
};

type AddressEvaluationRecord = {
  id: string;
  zoneVersionId: string | null;
  addressHash: string;
  input: unknown;
  eligible: boolean;
  reasonCode: string;
  feeCents: number | null;
  distanceMiles: unknown;
  routeMinutes: number | null;
  evaluatedAt: Date;
  expiresAt: Date;
};

export type AddressEvaluationClient = {
  addressEvaluation: {
    findFirst(args: unknown): Promise<AddressEvaluationRecord | null>;
    create(args: unknown): Promise<AddressEvaluationRecord>;
  };
};

export type RecordAddressEvaluationInput = {
  address: AddressIdentity;
  hashSecret: string;
  source: string;
  locationId?: string | null;
  zoneVersionId?: string | null;
  eligible: boolean;
  reasonCode: string;
  feeCents?: number | null;
  distanceMiles?: number | null;
  routeMinutes?: number | null;
  cacheTtlMinutes: number;
  evaluatedAt?: Date;
};

export type ReadFreshAddressEvaluationInput = {
  address: AddressIdentity;
  hashSecret: string;
  zoneVersionId?: string | null;
  now?: Date;
};

export type PersistedAddressEvaluation = Omit<AddressEvaluationRecord, "distanceMiles"> & {
  distanceMiles: number | null;
};

export class InvalidAddressEvaluationError extends Error {
  constructor() {
    super("The address evaluation input is invalid.");
    this.name = "InvalidAddressEvaluationError";
  }
}

export function hashAddressIdentity(address: AddressIdentity, hashSecret: string) {
  if (!isValidAddress(address) || !isValidHashSecret(hashSecret)) throw new InvalidAddressEvaluationError();
  const canonical = [
    "address-v1",
    address.addressLine1,
    address.addressLine2 ?? "",
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.country
  ].map(normalizeAddressPart);
  return createHmac("sha256", hashSecret).update(JSON.stringify(canonical)).digest("hex");
}

export async function recordAddressEvaluation(
  input: RecordAddressEvaluationInput,
  client: AddressEvaluationClient = getPrismaClient() as unknown as AddressEvaluationClient
): Promise<PersistedAddressEvaluation> {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  if (!isValidRecordInput(input, evaluatedAt)) throw new InvalidAddressEvaluationError();

  const addressHash = hashAddressIdentity(input.address, input.hashSecret);
  const expiresAt = new Date(evaluatedAt.getTime() + input.cacheTtlMinutes * 60_000);
  try {
    const record = await client.addressEvaluation.create({
      data: {
        zoneVersionId: input.zoneVersionId ?? null,
        addressHash,
        input: toPrismaJson(redactedAddressSnapshot(input)),
        eligible: input.eligible,
        reasonCode: input.reasonCode,
        feeCents: input.feeCents ?? null,
        distanceMiles: input.distanceMiles ?? null,
        routeMinutes: input.routeMinutes ?? null,
        evaluatedAt,
        expiresAt
      }
    });
    return mapAddressEvaluation(record);
  } catch (error) {
    throw new PersistenceUnavailableError("Address evaluation", { cause: error });
  }
}

export async function readFreshAddressEvaluation(
  input: ReadFreshAddressEvaluationInput,
  client: AddressEvaluationClient = getPrismaClient() as unknown as AddressEvaluationClient
): Promise<PersistedAddressEvaluation | null> {
  const now = input.now ?? new Date();
  if (!isValidDate(now)) throw new InvalidAddressEvaluationError();
  const addressHash = hashAddressIdentity(input.address, input.hashSecret);

  try {
    const record = await client.addressEvaluation.findFirst({
      where: {
        addressHash,
        expiresAt: { gt: now },
        ...(Object.hasOwn(input, "zoneVersionId") ? { zoneVersionId: input.zoneVersionId ?? null } : {})
      },
      orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }]
    });
    return record ? mapAddressEvaluation(record) : null;
  } catch (error) {
    throw new PersistenceUnavailableError("Address evaluation", { cause: error });
  }
}

function redactedAddressSnapshot(input: RecordAddressEvaluationInput) {
  const postalCode = normalizeAddressPart(input.address.postalCode).replace(/[^a-z0-9]/g, "");
  return {
    schemaVersion: 1,
    source: input.source,
    locationId: input.locationId ?? null,
    address: {
      country: normalizeAddressPart(input.address.country).toUpperCase(),
      administrativeArea: normalizeAddressPart(input.address.administrativeArea).toUpperCase(),
      postalCodePrefix: postalCode.slice(0, 3).toUpperCase(),
      hasSecondaryLine: Boolean(input.address.addressLine2?.trim()),
      street: "[REDACTED]"
    }
  };
}

function mapAddressEvaluation(record: AddressEvaluationRecord): PersistedAddressEvaluation {
  const distanceMiles = optionalDecimalToNumber(record.distanceMiles);
  if (distanceMiles === undefined) throw new InvalidAddressEvaluationError();
  return { ...record, distanceMiles };
}

function isValidRecordInput(input: RecordAddressEvaluationInput, evaluatedAt: Date) {
  return isValidAddress(input.address)
    && isValidHashSecret(input.hashSecret)
    && input.source.length > 0
    && input.reasonCode.length > 0
    && (input.locationId == null || input.locationId.length > 0)
    && (input.zoneVersionId == null || input.zoneVersionId.length > 0)
    && (input.feeCents == null || isNonnegativeInteger(input.feeCents))
    && isOptionalNonnegativeNumber(input.distanceMiles)
    && (input.routeMinutes == null || isNonnegativeInteger(input.routeMinutes))
    && Number.isInteger(input.cacheTtlMinutes)
    && input.cacheTtlMinutes > 0
    && isValidDate(evaluatedAt);
}

function isValidAddress(address: AddressIdentity) {
  return [
    address.addressLine1,
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.country
  ].every((part) => typeof part === "string" && part.trim().length > 0)
    && (address.addressLine2 == null || typeof address.addressLine2 === "string");
}

function isValidHashSecret(hashSecret: string) {
  return typeof hashSecret === "string" && Buffer.byteLength(hashSecret, "utf8") >= 32;
}

function normalizeAddressPart(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
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

function isValidDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isOptionalNonnegativeNumber(value: number | null | undefined) {
  return value == null || (Number.isFinite(value) && value >= 0);
}

function isNonnegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}
