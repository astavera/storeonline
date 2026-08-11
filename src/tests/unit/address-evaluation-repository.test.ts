/**
 * Verifies the isolated behavior of address evaluation repository.
 */

import { describe, expect, it, vi } from "vitest";
import {
  hashAddressIdentity,
  InvalidAddressEvaluationError,
  readFreshAddressEvaluation,
  recordAddressEvaluation,
  type AddressEvaluationClient,
  type AddressIdentity
} from "@/server/fulfillment/address-evaluation-repository";

const hashSecret = "phase-2-test-secret-with-at-least-thirty-two-bytes";
const address: AddressIdentity = {
  addressLine1: "500 E 80th St",
  addressLine2: "Apt 12B",
  locality: "New York",
  administrativeArea: "NY",
  postalCode: "10075",
  country: "US"
};
const evaluatedAt = new Date("2026-07-20T16:00:00.000Z");

function databaseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "evaluation-1",
    zoneVersionId: "zone-version-3",
    addressHash: hashAddressIdentity(address, hashSecret),
    input: { schemaVersion: 1 },
    eligible: true,
    reasonCode: "ELIGIBLE",
    feeCents: 1000,
    distanceMiles: { toNumber: () => 0.7 },
    routeMinutes: 12,
    evaluatedAt,
    expiresAt: new Date("2026-07-20T16:15:00.000Z"),
    ...overrides
  };
}

describe("address evaluation repository", () => {
  it("uses a keyed canonical hash without exposing the address", () => {
    const normalizedVariant = {
      ...address,
      addressLine1: "  500 E 80TH ST  ",
      locality: "NEW   YORK"
    };
    expect(hashAddressIdentity(normalizedVariant, hashSecret)).toBe(hashAddressIdentity(address, hashSecret));
    expect(hashAddressIdentity({ ...address, addressLine1: "501 E 80th St" }, hashSecret))
      .not.toBe(hashAddressIdentity(address, hashSecret));
    expect(hashAddressIdentity(address, hashSecret)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("persists only a redacted snapshot with a bounded expiry", async () => {
    const create = vi.fn(async (args: { data: Record<string, unknown> }) => databaseRecord({
      ...args.data,
      input: args.data.input,
      distanceMiles: args.data.distanceMiles
    }));
    const client = { addressEvaluation: { create, findFirst: vi.fn() } } as unknown as AddressEvaluationClient;

    await expect(recordAddressEvaluation({
      address,
      hashSecret,
      source: "MAPBOX",
      locationId: "store-3rd-avenue",
      zoneVersionId: "zone-version-3",
      eligible: true,
      reasonCode: "ELIGIBLE",
      feeCents: 1000,
      distanceMiles: 0.7,
      routeMinutes: 12,
      cacheTtlMinutes: 15,
      evaluatedAt
    }, client)).resolves.toMatchObject({
      eligible: true,
      expiresAt: new Date("2026-07-20T16:15:00.000Z"),
      distanceMiles: 0.7
    });

    const persisted = create.mock.calls[0][0].data;
    expect(JSON.stringify(persisted.input)).not.toContain("500 E 80th");
    expect(JSON.stringify(persisted.input)).not.toContain("Apt 12B");
    expect(JSON.stringify(persisted.input)).not.toContain("New York");
    expect(persisted.input).toEqual({
      schemaVersion: 1,
      source: "MAPBOX",
      locationId: "store-3rd-avenue",
      address: {
        country: "US",
        administrativeArea: "NY",
        postalCodePrefix: "100",
        hasSecondaryLine: true,
        street: "[REDACTED]"
      }
    });
  });

  it("reads only an unexpired evaluation for the requested version", async () => {
    const findFirst = vi.fn().mockResolvedValue(databaseRecord());
    const client = { addressEvaluation: { findFirst, create: vi.fn() } } as unknown as AddressEvaluationClient;

    await expect(readFreshAddressEvaluation({
      address,
      hashSecret,
      zoneVersionId: "zone-version-3",
      now: evaluatedAt
    }, client)).resolves.toMatchObject({ id: "evaluation-1", distanceMiles: 0.7 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        addressHash: hashAddressIdentity(address, hashSecret),
        zoneVersionId: "zone-version-3",
        expiresAt: { gt: evaluatedAt }
      })
    }));
  });

  it("rejects an unkeyed or weak address hash", () => {
    expect(() => hashAddressIdentity(address, "too-short")).toThrow(InvalidAddressEvaluationError);
  });
});
