/**
 * Reads Party Supplies recommendation candidates from the authoritative catalog.
 * PostgreSQL is used in production; the explicit local cache remains dev-only.
 */

import "server-only";

import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { isDevelopmentLocalPersistenceEnabled, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import {
  readPostgresAdminProductsByVariationIds,
  readPostgresAdminVariationSelection
} from "@/server/square/postgres-admin-catalog-store";

const maximumCandidates = 5_000;
const maximumPerTerm = 1_000;

export async function readPartyRecommendationCandidates(terms: string[]): Promise<StorefrontProduct[]> {
  const queries = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean))).slice(0, 20);
  if (queries.length === 0) return [];

  const persistence = requireDatabaseOrDevelopmentFallback("Party merchandising recommendations");
  if (persistence === "development-local") return readLocalCandidates(queries);

  try {
    const selections = await Promise.all(queries.map((query) => readPostgresAdminVariationSelection({ query }, maximumPerTerm)));
    const variationIds = uniqueIds(selections.flatMap((selection) => selection.variationIds));
    return await readPostgresAdminProductsByVariationIds(variationIds);
  } catch (error) {
    if (!isDevelopmentLocalPersistenceEnabled()) throw error;
    return readLocalCandidates(queries);
  }
}

async function readLocalCandidates(queries: string[]) {
  const {
    readSquareStorefrontProductsByVariationIds,
    readSquareStorefrontVariationSelection
  } = await import("@/server/square/catalog-test-cache-store");
  const variationIds = uniqueIds(queries.flatMap((query) =>
    readSquareStorefrontVariationSelection({ query }, maximumPerTerm).variationIds
  ));
  return readSquareStorefrontProductsByVariationIds(variationIds);
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, maximumCandidates);
}
