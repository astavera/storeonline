// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function readRepositoryFile(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function serviceBlock(compose: string, service: "migrate" | "storefront") {
  const nextBoundary = service === "migrate" ? "  storefront:" : "networks:";
  const start = compose.indexOf(`  ${service}:`);
  const end = compose.indexOf(`\n${nextBoundary}`, start);
  return compose.slice(start, end);
}

function configuredNames(envFile: string) {
  return envFile
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")));
}

function assertDatabaseBoundary(value: string, expectedUser: string) {
  const parsed = new URL(value);
  expect(parsed.protocol).toBe("postgresql:");
  expect(parsed.username).toBe(expectedUser);
  expect(parsed.password).toMatch(/^CHANGE_ME_[A-Z_]+_DB_PASSWORD$/u);
  expect(parsed.hostname).toBe("storefront-postgres");
  expect(parsed.port).toBe("5432");
  expect(parsed.pathname).toBe("/storefront_prod");
}

describe("production deployment contract", () => {
  it("isolates the required runtime and migrator env files in Compose", () => {
    const compose = readRepositoryFile("infrastructure/production/compose.yml");
    const migrate = serviceBlock(compose, "migrate");
    const storefront = serviceBlock(compose, "storefront");

    expect(compose.match(/STOREFRONT_RUNTIME_ENV_FILE:\?/gu)).toHaveLength(1);
    expect(compose.match(/STOREFRONT_MIGRATOR_ENV_FILE:\?/gu)).toHaveLength(1);
    expect(compose).not.toContain("STOREFRONT_ENV_FILE");

    expect(migrate).toContain("STOREFRONT_MIGRATOR_ENV_FILE:?");
    expect(migrate).not.toContain("STOREFRONT_RUNTIME_ENV_FILE");
    expect(storefront).toContain("STOREFRONT_RUNTIME_ENV_FILE:?");
    expect(storefront).not.toContain("STOREFRONT_MIGRATOR_ENV_FILE");
    expect(compose).not.toMatch(/^\s+depends_on:/mu);
    expect(compose).not.toMatch(/^\s+(?:DATABASE_URL|DIRECT_URL):/mu);
  });

  it("requires an immutable image tag and preserves all three networks", () => {
    const compose = readRepositoryFile("infrastructure/production/compose.yml");

    expect(compose.match(/STOREFRONT_IMAGE_TAG:\?/gu)).toHaveLength(2);
    expect(compose).not.toContain("STOREFRONT_IMAGE_TAG:-");
    expect(compose).not.toContain("STOREFRONT_IMAGE_TAG-canary");
    expect(compose).toContain("database: {}\n      orderpro-private: {}\n      gateway:");
    expect(compose).toContain("aliases:\n          - storefront");
    expect(compose).toContain("name: ${STOREFRONT_DATABASE_NETWORK:-storefront-production-database}");
    expect(compose).toContain("name: ${STOREFRONT_ORDERPRO_NETWORK:-storefront-orderpro-private}");
    expect(compose).toContain("name: ${STOREFRONT_GATEWAY_NETWORK:-storefront-public-gateway}");
  });

  it("pins the official Node base image by tag and digest", () => {
    const dockerfile = readRepositoryFile("Dockerfile");

    expect(dockerfile).toContain(
      "FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base"
    );
    expect(dockerfile).not.toContain("ARG NODE_IMAGE");
  });

  it("keeps exact PostgreSQL roles, host, and database in separate examples", () => {
    const runtime = readRepositoryFile("infrastructure/production/env.runtime.example");
    const migrator = readRepositoryFile("infrastructure/production/env.migrator.example");
    const runtimeDatabaseUrl = runtime.match(/^DATABASE_URL=(.+)$/mu)?.[1];
    const runtimeDirectUrl = runtime.match(/^DIRECT_URL=(.+)$/mu)?.[1];
    const migratorDatabaseUrl = migrator.match(/^DATABASE_URL=(.+)$/mu)?.[1];
    const migratorDirectUrl = migrator.match(/^DIRECT_URL=(.+)$/mu)?.[1];

    expect(runtimeDatabaseUrl).toBeDefined();
    expect(runtimeDirectUrl).toBeDefined();
    expect(migratorDatabaseUrl).toBeDefined();
    expect(migratorDirectUrl).toBeDefined();
    assertDatabaseBoundary(runtimeDatabaseUrl!, "storefront_runtime");
    assertDatabaseBoundary(runtimeDirectUrl!, "storefront_runtime");
    assertDatabaseBoundary(migratorDatabaseUrl!, "storefront_migrator");
    assertDatabaseBoundary(migratorDirectUrl!, "storefront_migrator");

    expect(runtime).not.toContain("storefront_migrator");
    expect(migrator).not.toContain("storefront_runtime");
    expect(configuredNames(migrator)).toEqual(["DATABASE_URL", "DIRECT_URL"]);
  });

  it("makes preflight enforce file, role, endpoint, and service isolation", () => {
    const preflight = readRepositoryFile("infrastructure/production/preflight.sh");

    expect(preflight).toContain("if (( $# != 2 )); then");
    expect(preflight).toContain("RUNTIME_ENV_FILE MIGRATOR_ENV_FILE");
    expect(preflight).toContain('[[ -L "${path}" ]]');
    expect(preflight).toContain("stat -c '%a'");
    expect(preflight).toContain('[[ "${mode}" == "600" ]]');
    expect(preflight).toContain('"${runtime_env_file}" -ef "${migrator_env_file}"');
    expect(preflight).toContain("storefront_runtime");
    expect(preflight).toContain("storefront_migrator");
    expect(preflight).toContain('[[ "${host}" == "storefront-postgres"');
    expect(preflight).toContain('[[ "${database}" == "storefront_prod" ]]');
    expect(preflight).toContain('validate_network "${database_network}" true');
    expect(preflight).toContain('validate_network "${orderpro_network}" true');
    expect(preflight).toContain('validate_network "${gateway_network}" false');
    expect(preflight).toContain('"storefront-postgres"');
    expect(preflight).toContain('"orderpro-api"');
    expect(preflight).toContain("exactly one running private OrderPRO container is required");
    expect(preflight).toContain("Caddy must not join a Storefront database or private API network");
    expect(preflight).toContain("migrator credentials are absent from the storefront runtime environment");
    expect(preflight).toContain("runtime credentials are absent from the migrator environment");
    expect(preflight).toContain('^[0-9a-f]{40}$');
    expect(preflight).not.toContain("STOREFRONT_ENV_FILE=");
  });

  it("generates two private outputs from different PostgreSQL passwords", () => {
    const generator = readRepositoryFile("scripts/create-private-storefront-env.ps1");

    expect(generator).toContain("[string]$RuntimeTargetPath");
    expect(generator).toContain("[string]$MigratorTargetPath");
    expect(generator).toContain('"STOREFRONT_RUNTIME_DB_PASSWORD"');
    expect(generator).toContain('"STOREFRONT_MIGRATOR_DB_PASSWORD"');
    expect(generator).toContain('"STOREFRONT_RUNTIME_PASSWORD"');
    expect(generator).toContain('"STOREFRONT_MIGRATOR_PASSWORD"');
    expect(generator).toContain('"CUSTOMER_SESSION_SECRET"');
    expect(generator).toContain('"RESEND_API_KEY"');
    expect(generator).toContain('"ORDERPRO_RUNTIME_PASSWORD"');
    expect(generator).toContain('"ORDERPRO_MIGRATOR_PASSWORD"');
    expect(generator).toContain("DATABASE_ENV_MUST_NOT_BE_A_RUNTIME_SOURCE");
    expect(generator).toContain("RUNTIME_AND_MIGRATOR_PASSWORDS_MUST_DIFFER");
    expect(generator).toContain("postgresql://storefront_runtime:");
    expect(generator).toContain("postgresql://storefront_migrator:");
    expect(generator).toContain("Write-PrivateEnvFile -Path $runtimeTargetFullPath");
    expect(generator).toContain("Write-PrivateEnvFile -Path $migratorTargetFullPath");
    expect(generator).not.toMatch(/\[string\]\$TargetPath\b/u);
  });

  it("promotes current only after build, migration, and canary verification", () => {
    const runbook = readRepositoryFile("docs/vps-canary-runbook.md");
    const buildIndex = runbook.indexOf("  build");
    const migrationIndex = runbook.indexOf("  run --rm migrate");
    const smokeIndex = runbook.indexOf(
      "infrastructure/production/smoke-canary.sh https://shop.srv1849559.hstgr.cloud"
    );
    const promoteCommand = 'sudo ln -sfn "$CANDIDATE_RELEASE" /srv/storefront/current';
    const promoteIndex = runbook.indexOf(promoteCommand);

    expect(buildIndex).toBeGreaterThan(0);
    expect(migrationIndex).toBeGreaterThan(buildIndex);
    expect(smokeIndex).toBeGreaterThan(migrationIndex);
    expect(promoteIndex).toBeGreaterThan(smokeIndex);
    expect(runbook.split(promoteCommand)).toHaveLength(2);
    expect(runbook).toContain("STOREFRONT_RUNTIME_ENV_FILE=/srv/storefront/secrets/storefront-runtime.env");
    expect(runbook).toContain("STOREFRONT_MIGRATOR_ENV_FILE=/srv/storefront/secrets/storefront-migrator.env");
    expect(runbook).toContain('STOREFRONT_IMAGE_TAG="$STOREFRONT_COMMIT"');
    expect(runbook).toContain("docker network create --driver bridge --internal storefront-production-database");
    expect(runbook).toContain("docker network create --driver bridge --internal storefront-orderpro-private");
    expect(runbook).toContain('storefront-${STOREFRONT_COMMIT}.tar.gz.sha256');
  });

  it("packages releases with the full immutable commit", () => {
    const packager = readRepositoryFile("scripts/package-storefront-release.ps1");

    expect(packager).toContain('$releaseName = "storefront-$commit"');
    expect(packager).not.toContain("Substring(0, 12)");
  });
});
