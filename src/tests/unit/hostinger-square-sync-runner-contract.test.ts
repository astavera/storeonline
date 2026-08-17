// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function readRepositoryFile(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8").replace(/\r\n/gu, "\n");
}

function configuredNames(envFile: string) {
  return envFile
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")));
}

describe("Hostinger topology Square sync runner contract", () => {
  it("uses only the external root-owned environment and an explicit immutable release pointer", () => {
    const runner = readRepositoryFile("infrastructure/hostinger/run-square-postgres-sync-v1.sh");
    const releasePointerExample = readRepositoryFile("infrastructure/hostinger/current-release.example");

    expect(runner).toContain('EXPECTED_ENV_FILE="/srv/storefront/secrets/storefront-square-sync.env"');
    expect(runner).toContain('EXPECTED_RELEASE_POINTER="/srv/storefront/operations/square-sync/current-release"');
    expect(runner).toContain('RELEASES_ROOT="/srv/storefront/releases"');
    expect(runner).toContain('validate_root_file "$EXPECTED_ENV_FILE" "600" "environment"');
    expect(runner).toContain('validate_root_file "$EXPECTED_RELEASE_POINTER" "600" "release_pointer"');
    expect(runner).toContain("'%u|%a|%h|%F'");
    expect(runner).toContain("the release must be one direct child of the approved release root");
    expect(runner).not.toContain("/srv/storefront/current");
    expect(runner).not.toMatch(/\{40\}/u);
    expect(releasePointerExample).toBe([
      "release=/srv/storefront/releases/CHANGE_ME_IMMUTABLE_RELEASE",
      "image=sha256:CHANGE_ME_64_LOWERCASE_HEX_IMAGE_ID",
      ""
    ].join("\n"));
  });

  it("locks before running pinned one-shot check, sync, and status containers", () => {
    const runner = readRepositoryFile("infrastructure/hostinger/run-square-postgres-sync-v1.sh");

    expect(runner).toContain('LOCK_FILE="/run/storefront-square-sync/sync.lock"');
    expect(runner).toContain('CID_FILE="/run/storefront-square-sync/container.cid"');
    expect(runner).toContain('"$FLOCK_BIN" -n 9');
    expect(runner).toContain('[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]]');
    expect(runner).toContain('"$DOCKER_BIN" image inspect');
    expect(runner).toContain("run_sync_container --check");
    expect(runner).toContain("run_sync_container --sync");
    expect(runner).toContain("run_sync_container --status");
    expect(runner).toContain("--pull=never");
    expect(runner).toContain('--cidfile "$CID_FILE"');
    expect(runner).toContain('--env-file "$EXPECTED_ENV_FILE"');
    expect(runner).not.toContain("NODE_BIN");
    expect(runner).not.toContain("node_modules");
    expect(runner).not.toMatch(/curl|wget|\/api\/internal|https?:\/\//u);
    expect(runner).not.toMatch(/npm (?:run|exec)|npx/u);
  });

  it("uses a dedicated external-egress bridge and a hardened container with no ports", () => {
    const runner = readRepositoryFile("infrastructure/hostinger/run-square-postgres-sync-v1.sh");

    expect(runner).toContain('EGRESS_NETWORK="storefront-square-sync-egress"');
    expect(runner).toContain("--driver bridge");
    expect(runner).toContain('"$network_internal" == "false"');
    expect(runner).toContain('"$network_containers" == "0"');
    expect(runner).toContain('--network "$EGRESS_NETWORK"');
    expect(runner).toContain("--read-only");
    expect(runner).toContain("--tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777");
    expect(runner).toContain("--cap-drop ALL");
    expect(runner).toContain("--security-opt no-new-privileges:true");
    expect(runner).not.toMatch(/--publish|--expose|(?:^|\s)-p(?:\s|$)/mu);
    for (const forbiddenNetwork of [
      "storefront-production-database",
      "storefront-orderpro-private",
      "storefront-public-gateway",
      "orderpro-production-egress"
    ]) {
      expect(runner).not.toContain(forbiddenNetwork);
    }
  });

  it("requires every commerce gate off and permits only the reviewed sync environment names", () => {
    const runner = readRepositoryFile("infrastructure/hostinger/run-square-postgres-sync-v1.sh");
    const example = readRepositoryFile("infrastructure/hostinger/env.vps-square-sync.example");
    const expectedNames = [
      "DATABASE_URL",
      "DIRECT_URL",
      "SQUARE_ENVIRONMENT",
      "SQUARE_ALLOW_PRODUCTION_READONLY_SYNC",
      "SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS",
      "SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS",
      "SQUARE_ACCESS_TOKEN",
      "E2E_CATALOG_FIXTURE",
      "SQUARE_CHECKOUT_ENABLED",
      "SQUARE_RETURNS_REFUNDS_ENABLED",
      "ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED",
      "ORDERPRO_SHIPPING_CHECKOUT_ENABLED",
      "ORDERPRO_RETURNS_ENABLED",
      "ALLOW_LOCAL_PERSISTENCE_FALLBACK"
    ];

    expect(configuredNames(example)).toEqual(expectedNames);
    for (const name of expectedNames) expect(runner).toContain(`[${name}]=1`);
    expect(runner).toContain('[[ "$line" == "$name=false" ]]');
    expect(example.match(/sslmode=require/gu)).toHaveLength(2);
    expect(example.match(/sslaccept=strict/gu)).toHaveLength(2);
    expect(runner).toContain("sslmode_count == 1 && sslaccept_count == 1");
    expect(runner).toContain("must use the storefront_sync Supabase session-pooler identity");
  });

  it("keeps secrets out of systemd and schedules well inside 1800 seconds", () => {
    const runner = readRepositoryFile("infrastructure/hostinger/run-square-postgres-sync-v1.sh");
    const service = readRepositoryFile("infrastructure/hostinger/systemd/storefront-square-postgres-sync.service");
    const timer = readRepositoryFile("infrastructure/hostinger/systemd/storefront-square-postgres-sync.timer");

    expect(service).not.toContain("EnvironmentFile=");
    expect(service).not.toContain("SQUARE_ACCESS_TOKEN");
    expect(service).toContain("Environment=DOCKER_HOST=unix:///run/docker.sock");
    expect(service).toContain("RestrictAddressFamilies=AF_UNIX");
    expect(service).toContain(
      "ExecStart=/srv/storefront/operations/square-sync/run-square-postgres-sync-v1.sh /srv/storefront/secrets/storefront-square-sync.env /srv/storefront/operations/square-sync/current-release"
    );
    expect(service).toContain(
      "ExecStopPost=-/srv/storefront/operations/square-sync/run-square-postgres-sync-v1.sh --cleanup"
    );
    expect(service).toContain("TimeoutStopSec=45s");
    expect(service).toContain("RuntimeDirectory=storefront-square-sync");
    expect(service).toContain("RuntimeDirectoryMode=0700");
    expect(service).toContain("ReadWritePaths=/run/storefront-square-sync /run/docker.sock");
    expect(runner).toContain("cleanup_sync_container");
    expect(runner).toContain("trap cleanup_on_exit EXIT");
    expect(runner).toContain("trap 'exit 143' TERM");
    expect(runner).toContain('"$inspected_name" == "/$CONTAINER_NAME"');
    expect(runner).toContain('"$run_contract" == "$CONTRACT_VERSION"');
    expect(service).toContain("NoNewPrivileges=true");
    expect(service).toContain("ProtectSystem=strict");
    expect(service).not.toContain("ConditionPath");
    expect(service).toContain("TimeoutStartSec=10min");
    expect(timer).toContain("OnUnitInactiveSec=8min");
    expect(timer).toContain("AccuracySec=15s");
    expect(timer).toContain("RandomizedDelaySec=15s");
    expect(timer).toContain("Unit=storefront-square-postgres-sync.service");
    const maximumRecoveryWindowSeconds = 2 * 10 * 60 + 45 + 8 * 60 + 15 + 15;
    expect(maximumRecoveryWindowSeconds).toBe(1_755);
    expect(maximumRecoveryWindowSeconds).toBeLessThan(1_800);
  });

  it("builds a dedicated non-server image whose entrypoint is the read-only CLI", () => {
    const dockerfile = readRepositoryFile("Dockerfile");
    const start = dockerfile.indexOf("FROM base AS square-sync\n");
    const end = dockerfile.indexOf("\nFROM dependencies AS builder", start);
    const syncStage = dockerfile.slice(start, end);

    expect(dockerfile).toContain("FROM base AS square-sync-dependencies");
    expect(dockerfile).toContain("RUN npm ci --omit=dev --ignore-scripts");
    expect(dockerfile).toContain("COPY --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma");
    expect(syncStage).toContain('com.modernstate.storefront.square-sync.contract="1"');
    expect(syncStage).toContain("COPY --chown=node:node src ./src");
    expect(syncStage).toContain("USER node");
    expect(syncStage).toContain('ENTRYPOINT ["node"');
    expect(syncStage).toContain('"./scripts/sync-square-postgres-read-only.ts"]');
    expect(syncStage).toContain('CMD ["--sync"]');
    expect(syncStage).not.toContain("EXPOSE");
    expect(syncStage).not.toContain("server.js");
  });

  it("makes CLI status observable and nonzero for failed assessment", () => {
    const cli = readRepositoryFile("scripts/sync-square-postgres-read-only.ts");

    expect(cli).toContain("const status = assessSquarePostgresSyncStatus({");
    expect(cli).toContain("if (!status.ok) process.exitCode = 1;");
    expect(cli).toContain("if (synchronizationSucceeded) await reportStatus(environment);");
    expect(cli).toContain('if (process.env.SQUARE_SYNC_EXTERNAL_ENV_ONLY === "true") return;');
  });
});
