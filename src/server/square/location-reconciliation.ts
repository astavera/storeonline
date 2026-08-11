/**
 * Implements server-side location reconciliation behavior and persistence boundaries.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  readConfiguredSquareLocationsReadOnly,
  type SquareLocationReference
} from "@/server/square/read-only-catalog";

export type LocalLocationReference = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  squareLocationId: string | null;
};

export const reviewedSquareLocationMappings = [
  { localLocationId: "store-3rd-avenue", squareLocationId: "LP9N7FFH78H2W" },
  { localLocationId: "store-86th-street", squareLocationId: "LPTVETSP8A546" }
] as const;

export const squareLocationMappingConfirmation = "modern-state-square-location-mapping-v1";

export function rankSquareLocationCandidates(local: LocalLocationReference, squareLocations: SquareLocationReference[]) {
  return squareLocations.map((square) => {
    const reasons: string[] = [];
    let score = 0;
    const localPhone = digits(local.phone);
    const squarePhone = digits(square.phone);
    if (localPhone && squarePhone && localPhone.slice(-10) === squarePhone.slice(-10)) {
      score += 6;
      reasons.push("phone");
    }
    const localPostalCode = local.address.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? null;
    if (localPostalCode && square.postalCode && localPostalCode.slice(0, 5) === square.postalCode.slice(0, 5)) {
      score += 3;
      reasons.push("postal-code");
    }
    const localStreetNumber = local.address.match(/^\s*(\d+)/)?.[1] ?? null;
    const squareStreetNumber = square.addressLine1?.match(/^\s*(\d+)/)?.[1] ?? null;
    if (localStreetNumber && squareStreetNumber && localStreetNumber === squareStreetNumber) {
      score += 3;
      reasons.push("street-number");
    }
    const localName = normalize(local.name);
    const squareName = normalize(square.name);
    if (localName && squareName && (localName.includes(squareName) || squareName.includes(localName))) {
      score += 2;
      reasons.push("name");
    }
    return { squareLocation: square, score, reasons };
  }).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.squareLocation.name.localeCompare(right.squareLocation.name));
}

export async function auditSquareLocationMappingsReadOnly() {
  try {
    const [localLocations, squareLocations] = await Promise.all([
      getPrismaClient().storeLocation.findMany({
        orderBy: { slug: "asc" },
        select: { id: true, name: true, address: true, phone: true, squareLocationId: true }
      }),
      readConfiguredSquareLocationsReadOnly()
    ]);
    return {
      mode: "square-location-read-only-audit",
      squareWritesEnabled: false,
      localLocations: localLocations.map((local) => {
        const candidates = rankSquareLocationCandidates(local, squareLocations).slice(0, 3);
        const uniqueHighConfidence = candidates[0]?.score >= 9 && (!candidates[1] || candidates[0].score > candidates[1].score);
        return {
          ...local,
          suggestedSquareLocationId: uniqueHighConfidence ? candidates[0].squareLocation.id : null,
          candidates
        };
      }),
      squareLocations
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Square location reconciliation", { cause: error });
  }
}

export async function applyReviewedSquareLocationMappings(confirmation: string) {
  if (confirmation !== squareLocationMappingConfirmation) {
    throw new Error(`Refusing Square location mapping. Confirmation must be ${squareLocationMappingConfirmation}.`);
  }
  const audit = await auditSquareLocationMappingsReadOnly();
  for (const mapping of reviewedSquareLocationMappings) {
    const local = audit.localLocations.find((location) => location.id === mapping.localLocationId);
    const candidate = local?.candidates.find((entry) => entry.squareLocation.id === mapping.squareLocationId);
    if (!local || !candidate || candidate.score < 9 || candidate.squareLocation.status !== "ACTIVE" || candidate.squareLocation.type !== "PHYSICAL") {
      throw new Error(`Square location ${mapping.squareLocationId} no longer matches ${mapping.localLocationId} with high confidence.`);
    }
  }

  try {
    return await getPrismaClient().$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 'locked'::text AS status FROM pg_advisory_xact_lock(hashtext('modern-state-square-location-mapping'))`;
      const localLocations = await transaction.storeLocation.findMany({
        where: { id: { in: reviewedSquareLocationMappings.map((mapping) => mapping.localLocationId) } }
      });
      if (localLocations.length !== reviewedSquareLocationMappings.length) {
        throw new Error("One or more reviewed local store locations are missing.");
      }
      let updated = 0;
      let unchanged = 0;
      for (const mapping of reviewedSquareLocationMappings) {
        const local = localLocations.find((location) => location.id === mapping.localLocationId)!;
        if (local.squareLocationId && local.squareLocationId !== mapping.squareLocationId) {
          throw new Error(`Local location ${local.id} already points to a different Square location.`);
        }
        const conflict = await transaction.storeLocation.findFirst({
          where: { squareLocationId: mapping.squareLocationId, id: { not: mapping.localLocationId } },
          select: { id: true }
        });
        if (conflict) throw new Error(`Square location ${mapping.squareLocationId} is already assigned to ${conflict.id}.`);
        if (local.squareLocationId === mapping.squareLocationId) {
          unchanged += 1;
          continue;
        }
        await transaction.storeLocation.update({
          where: { id: mapping.localLocationId },
          data: { squareLocationId: mapping.squareLocationId }
        });
        updated += 1;
      }
      if (updated > 0) {
        await transaction.auditLog.create({
          data: {
            action: "SQUARE_LOCATION_MAPPINGS_APPLIED",
            entityType: "StoreLocation",
            entityId: squareLocationMappingConfirmation,
            after: reviewedSquareLocationMappings.map((mapping) => ({ ...mapping }))
          }
        });
      }
      return { updated, unchanged, confirmation: squareLocationMappingConfirmation };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Square location mapping", { cause: error });
  }
}

function digits(value: string | null) {
  return value?.replace(/\D/g, "") || "";
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
