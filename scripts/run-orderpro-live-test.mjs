import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (process.env.ORDERPRO_RUN_LIVE_M2M_TEST !== "true") {
  console.error("Live OrderPRO certification was not run. Set ORDERPRO_RUN_LIVE_M2M_TEST=true explicitly.");
  process.exit(1);
}

const vitestEntry = resolve(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitestEntry, "run", "src/tests/integration/orderpro-auth-check.live.test.ts"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error("Unable to start the live OrderPRO certification test.");
  process.exit(1);
}

process.exit(result.status ?? 1);
