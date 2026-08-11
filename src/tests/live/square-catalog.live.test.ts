/**
 * Defines the Square catalog live module used by the storefront application.
 */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { beforeAll, describe, expect, it } from "vitest";
import { auditSquareCatalogReadOnly, type SquareCatalogAudit, type SquareCatalogEnvironment } from "@/server/square/read-only-catalog";

if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

describe("Square live catalog (read-only)", () => {
  let audit: SquareCatalogAudit;

  beforeAll(async () => {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN?.trim();

    if (!accessToken) {
      throw new Error("Add SQUARE_ACCESS_TOKEN to .env.local before running npm run test:square:catalog. Never commit or paste the token into logs.");
    }

    audit = await auditSquareCatalogReadOnly({
      accessToken,
      environment: parseEnvironment(process.env.SQUARE_ENVIRONMENT),
      maxPages: Number(process.env.SQUARE_CATALOG_TEST_MAX_PAGES || 2)
    });
  }, 60_000);

  it("reads locations, items, variations, and prices without mutations", () => {
    expect(audit.locations.length).toBeGreaterThan(0);
    expect(audit.itemCount).toBeGreaterThan(0);
    expect(audit.variationCount).toBeGreaterThan(0);
    expect(audit.pricedVariationCount).toBeGreaterThan(0);

    console.info(JSON.stringify(audit, null, 2));
  });
});

function parseEnvironment(value: string | undefined): SquareCatalogEnvironment {
  if (!value || value === "sandbox") {
    return "sandbox";
  }

  if (value === "production") {
    return "production";
  }

  throw new Error("SQUARE_ENVIRONMENT must be sandbox or production.");
}
