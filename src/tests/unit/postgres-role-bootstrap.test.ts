// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function readRepositoryFile(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8").replace(/\r\n/gu, "\n");
}

function sqlArray(sql: string, name: string) {
  const declaration = new RegExp(`${name}\\s+CONSTANT\\s+text\\[\\]\\s*:=\\s*ARRAY\\[(.*?)\\];`, "su")
    .exec(sql)?.[1];
  if (!declaration) throw new Error(`Missing SQL manifest ${name}.`);
  return Array.from(declaration.matchAll(/'([^']+)'/gu), (match) => match[1]);
}

function prismaNames(kind: "enum" | "model") {
  const schema = readRepositoryFile("prisma/schema.prisma");
  return Array.from(schema.matchAll(new RegExp(`^${kind}\\s+(\\w+)`, "gmu")), (match) => match[1]);
}

describe("PostgreSQL role bootstrap", () => {
  const bootstrap = readRepositoryFile("infrastructure/postgres/bootstrap-storefront-roles.sql");
  const verifier = readRepositoryFile("infrastructure/postgres/verify-storefront-roles.sql");
  const operatorGuide = readRepositoryFile("docs/postgres-role-bootstrap.md");

  it("keeps the migration ownership manifests synchronized with Prisma", () => {
    expect(sqlArray(bootstrap, "prisma_table_names")).toEqual(prismaNames("model"));
    expect(sqlArray(verifier, "prisma_table_names")).toEqual(prismaNames("model"));
    expect(sqlArray(bootstrap, "prisma_type_names")).toEqual(prismaNames("enum"));
    expect(sqlArray(verifier, "prisma_type_names")).toEqual(prismaNames("enum"));
    expect(bootstrap).toContain("prisma_table_names || ARRAY['_prisma_migrations']");
    expect(verifier).toContain("prisma_table_names || ARRAY['_prisma_migrations']");
  });

  it("grants runtime only the current admin-preview database surface", () => {
    const expectedRuntimeReads = [
      "StoreLocation",
      "SquareCatalogObject",
      "SquareItemVariation",
      "SquareInventoryCount",
      "SquareCatalogSyncState",
      "CmsContentVersion",
      "AdminRateLimitBucket"
    ];

    expect(sqlArray(bootstrap, "runtime_select_table_names")).toEqual(expectedRuntimeReads);
    expect(sqlArray(verifier, "runtime_select_table_names")).toEqual(expectedRuntimeReads);
    expect(bootstrap).toContain('GRANT INSERT ON TABLE public."AdminRateLimitBucket" TO storefront_runtime');
    expect(bootstrap).toContain('GRANT UPDATE ("count", "expiresAt", "updatedAt")');
    expect(bootstrap).toContain('GRANT USAGE ON TYPE public."CmsPublishStatus" TO storefront_runtime');

    const previewPolicy = readRepositoryFile("src/server/storefront/admin-preview.ts");
    const catalogStore = readRepositoryFile("src/server/square/postgres-catalog-store.ts");
    const cmsStore = readRepositoryFile("src/server/db/cms-version-repository.ts");
    const rateLimitStore = readRepositoryFile("src/server/admin/admin-rate-limit.ts");
    const cartRoute = readRepositoryFile("src/app/api/cart/route.ts");

    expect(previewPolicy).toContain('"GET /api/admin/full-catalog-products"');
    expect(previewPolicy).toContain('"POST /api/admin/auth/login"');
    expect(previewPolicy).toContain('"POST /api/cart"');
    expect(catalogStore).toContain("prisma.squareCatalogObject.count");
    expect(catalogStore).toContain("prisma.squareItemVariation.findMany");
    expect(catalogStore).toContain("inventoryCounts:");
    expect(catalogStore).toContain("prisma.squareCatalogSyncState.findMany");
    expect(catalogStore).toContain("prisma.storeLocation.findMany");
    expect(cmsStore).toContain("getPrismaClient().cmsContentVersion.findFirst");
    expect(rateLimitStore).toContain("getPrismaClient().adminRateLimitBucket.upsert");
    expect(cartRoute).toContain("quoteCartFromOperationalCatalog");
    expect(cartRoute).not.toMatch(/\.(?:cart|cartItem)\.(?:create|upsert|update)/u);

    for (const deniedTable of [
      "AdminUser",
      "Cart",
      "CartItem",
      "CheckoutAttempt",
      "CustomerAccount",
      "CustomerSession",
      "OrderMirror",
      "ReturnRequest",
      "WebhookInboxEvent"
    ]) {
      expect(expectedRuntimeReads).not.toContain(deniedTable);
    }
  });

  it("limits sync writes to the projection and reviewed location mapping", () => {
    const projectionTables = [
      "SquareCatalogObject",
      "SquareItemVariation",
      "SquareInventoryCount",
      "SquareCatalogSyncState"
    ];
    const supportTables = ["StoreLocation", "AuditLog"];

    expect(sqlArray(bootstrap, "sync_projection_table_names")).toEqual(projectionTables);
    expect(sqlArray(verifier, "sync_projection_table_names")).toEqual(projectionTables);
    expect(sqlArray(bootstrap, "sync_support_select_table_names")).toEqual(supportTables);
    expect(sqlArray(verifier, "sync_support_select_table_names")).toEqual(supportTables);
    expect(bootstrap).toContain('GRANT UPDATE ("squareLocationId", "updatedAt")');
    expect(bootstrap).toContain('GRANT INSERT ON TABLE public."AuditLog" TO storefront_sync');

    const catalogSync = readRepositoryFile("src/server/square/catalog-postgres-sync.ts");
    const inventorySync = readRepositoryFile("src/server/square/inventory-postgres-sync.ts");
    const locationSync = readRepositoryFile("src/server/square/location-reconciliation.ts");
    expect(catalogSync).toContain('INSERT INTO "SquareCatalogObject"');
    expect(catalogSync).toContain('INSERT INTO "SquareItemVariation"');
    expect(catalogSync).toContain("squareCatalogSyncState.upsert");
    expect(inventorySync).toContain('INSERT INTO "SquareInventoryCount"');
    expect(locationSync).toContain("transaction.storeLocation.update");
    expect(locationSync).toContain("transaction.auditLog.create");
  });

  it("closes managed objects to Supabase Data API roles when they exist", () => {
    const expectedDataApiRoles = ["anon", "authenticated", "service_role"];

    expect(sqlArray(bootstrap, "supabase_data_api_role_names")).toEqual(expectedDataApiRoles);
    expect(sqlArray(verifier, "supabase_data_api_role_names")).toEqual(expectedDataApiRoles);
    expect(bootstrap).toContain("REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC");
    expect(bootstrap).toContain(
      "REVOKE ALL PRIVILEGES ON DATABASE %I FROM storefront_migrator, storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain(
      "REVOKE ALL PRIVILEGES ON SCHEMA public FROM storefront_migrator, storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain(
      "ON TABLE %2$I.%3$I FROM PUBLIC, storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain(
      "REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain(
      "REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain(
      "REVOKE ALL PRIVILEGES ON ROUTINE %I.%I(%s) FROM PUBLIC, storefront_sync, storefront_runtime CASCADE",
    );
    expect(bootstrap).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name)");
    expect(bootstrap).toContain("REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I CASCADE");
    expect(bootstrap).toContain("REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I CASCADE");
    expect(bootstrap).toContain("REVOKE ALL PRIVILEGES ON ROUTINE %I.%I(%s) FROM %I CASCADE");
    expect(bootstrap).toContain("REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I CASCADE");
    expect(bootstrap).toContain("Schema-local defaults are additive");
    expect(bootstrap).toContain("FOR ROLE storefront_migrator IN SCHEMA public");
    expect(verifier).toContain("existing_data_api_role_names");
    expect(verifier).toContain("data_api_role_oids");
    expect(verifier).toContain("Supabase Data API role % can access schema public");
    expect(verifier).toContain("Supabase Data API role % has % on public.%.%");
    expect(verifier).toContain("Supabase Data API role % has EXECUTE on routine public.%");
    expect(verifier).toContain("Supabase Data API role % has delegated % on public.%.%");
    expect(verifier).toContain("pg_has_role(effective_role.role_oid, acl.grantee, 'USAGE')");
    expect(operatorGuide).toContain("does not use the Supabase Data API");
    expect(operatorGuide).toMatch(/Projects without those Supabase roles remain\s+supported/u);
    expect(operatorGuide).toContain("do not alter Supabase's `auth`, `storage`, `realtime`");
  });

  it("is credential-free, idempotent, and fail-closed for future objects", () => {
    expect(bootstrap).toContain("IF NOT EXISTS (SELECT 1 FROM pg_roles");
    expect(bootstrap).toContain("Existing passwords are never changed");
    expect(bootstrap).toContain("GRANT storefront_migrator TO %I");
    expect(bootstrap).toContain("REVOKE %I FROM %I CASCADE");
    expect(bootstrap).toContain("REVOKE ADMIN OPTION FOR storefront_migrator FROM %I");
    expect(bootstrap).toContain("REVOKE storefront_runtime, storefront_sync FROM %I");
    expect(bootstrap).not.toContain("REVOKE storefront_migrator FROM %I");
    expect(bootstrap).not.toMatch(/^\s*(?:ALTER|CREATE)\s+ROLE\b.*\bPASSWORD\b/imu);
    expect(bootstrap).not.toContain("CHANGE_ME");
    expect(bootstrap).toContain("REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC");
    expect(bootstrap).toContain("REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s)");
    expect(bootstrap).toContain("REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC");
    expect(bootstrap).toContain("REVOKE USAGE ON TYPES FROM PUBLIC");
    expect(bootstrap).toContain("schema-local REVOKE cannot subtract a global or built-in");
    expect(bootstrap).toContain("Schema-local defaults are additive");
    expect(bootstrap).toContain("NOINHERIT NOREPLICATION NOBYPASSRLS");
    expect(bootstrap).toContain("ALTER ROLE %I RESET ALL");
    expect(bootstrap).toContain("DROP OWNED BY storefront_runtime, storefront_sync RESTRICT");
    expect(bootstrap).toContain("ownership_dependency.classid <> 'pg_catalog.pg_default_acl'::regclass");
    expect(operatorGuide).toContain("remove every stale direct grant");
    expect(operatorGuide).toContain("`DROP OWNED` cleanup remains `RESTRICT`, not `CASCADE`");
    expect(bootstrap).not.toMatch(/GRANT\s+ALL\s+PRIVILEGES[\s\S]*storefront_(?:runtime|sync)/iu);
  });

  it("ships an exact read-only verification and recovery procedure", () => {
    expect(verifier).toContain("BEGIN TRANSACTION READ ONLY");
    expect(verifier).toContain("has_column_privilege");
    expect(verifier).toContain("has_type_privilege");
    expect(verifier).toContain("has_sequence_privilege");
    expect(verifier).toContain("has_function_privilege");
    expect(verifier).toContain("SELECT WITH GRANT OPTION");
    expect(verifier).toContain("USAGE WITH GRANT OPTION");
    expect(verifier).toContain("EXECUTE WITH GRANT OPTION");
    expect(verifier).toContain("acl.grantee = ANY(restricted_role_oids)");
    expect(verifier).toContain("has_database_privilege(role_name, current_database(), 'CREATE')");
    expect(verifier).toContain("sole direct non-admin member of storefront_migrator");
    expect(verifier).toContain("Restricted role % must not be granted to any member");
    expect(verifier).toContain("indirect storefront_migrator member");
    expect(verifier).toContain("RAISE EXCEPTION");
    expect(verifier).toContain("storefront_role_acl_verified");
    expect(operatorGuide).toContain("-v ON_ERROR_STOP=1");
    expect(operatorGuide).toContain("\\password storefront_migrator");
    expect(operatorGuide).toContain("\\password storefront_sync");
    expect(operatorGuide).toContain("\\password storefront_runtime");
    expect(operatorGuide).toContain("REASSIGN OWNED BY storefront_migrator TO postgres");
    expect(operatorGuide).toContain("REVOKE storefront_migrator FROM postgres");
    expect(operatorGuide).toContain("DROP ROLE storefront_runtime");
    expect(operatorGuide).toContain("instead of\nusing `CASCADE`");
    expect(operatorGuide).toContain("PostgreSQL normally grants `TEMPORARY`");
    expect(operatorGuide).toContain("required so the Dashboard");
    expect(operatorGuide).toContain("sslmode=verify-full");
    expect(operatorGuide).toContain("sslrootcert=/path/to/prod-supabase.cer");
    expect(operatorGuide).not.toContain("sslmode=require");
  });
});
