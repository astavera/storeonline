#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIRMATION = "RUN_STAGING_B_CANCEL_THEN_A_SUCCESS_WITHOUT_SQUARE";
const VARIANT_A = "OIXCBCNMHZVFXTHIZ4RI6PIO";
const VARIANT_B = "NSRYCOYYAWR6G5LRWH5AKPP5";
const RESULT_MARKER = "ORDERPRO_LOCAL_DELIVERY_CANARY_RESULT=";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_STDOUT_BYTES = 256 * 1024;

function fail(code) {
  process.stderr.write(`${JSON.stringify({ status: "FAILED", code })}\n`);
  process.exit(1);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStableId(value) {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

function parseAllowedSlots(value) {
  const slots = value.split(",").map((slot) => slot.trim()).filter(Boolean);
  if (slots.length === 0 || new Set(slots).size !== slots.length || slots.some((slot) => !isStableId(slot))) {
    fail("CANARY_SLOT_ALLOWLIST_REJECTED");
  }
  return slots;
}

if (process.argv.length !== 2) fail("CANARY_ARGUMENTS_REJECTED");
if (process.env.ORDERPRO_RUN_LOCAL_DELIVERY_CANARY !== "true") fail("CANARY_GATE_REJECTED");
if (process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_CONFIRMATION !== CONFIRMATION) fail("CANARY_GATE_REJECTED");
if (process.env.ORDERPRO_INTEGRATION_ENVIRONMENT !== "STAGING") fail("CANARY_GATE_REJECTED");
if (process.env.ORDERPRO_M2M_AUTH_MODE !== "AUTH0") fail("CANARY_GATE_REJECTED");
if (process.env.ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED !== "false") fail("CANARY_GATE_REJECTED");
if (process.env.SQUARE_CHECKOUT_ENABLED !== "false") fail("CANARY_GATE_REJECTED");
if (process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_VARIANT_A !== VARIANT_A) fail("CANARY_GATE_REJECTED");
if (process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_VARIANT_B !== VARIANT_B) fail("CANARY_GATE_REJECTED");
if (!UUID_PATTERN.test(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_RUN_ID ?? "")) fail("CANARY_RUN_ID_REJECTED");
if (!(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_ADDRESS_JSON ?? "").trim()) fail("CANARY_INPUT_REJECTED");
if (!DATE_PATTERN.test(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_REQUESTED_DATE ?? "")) fail("CANARY_INPUT_REJECTED");
parseAllowedSlots(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_ALLOWED_SLOT_IDS ?? "");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitestEntry = resolve(root, "node_modules", "vitest", "vitest.mjs");
const testFile = "src/tests/integration/orderpro-local-delivery-canary.live.test.ts";

const childResult = await new Promise((resolveResult) => {
  let stdout = "";
  let oversized = false;
  let child;
  try {
    child = spawn(
      process.execPath,
      [vitestEntry, "run", testFile, "--no-file-parallelism", "--maxWorkers=1"],
      {
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
  } catch {
    resolveResult({ code: null, stdout: "", oversized: false, spawnError: true });
    return;
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (oversized) return;
    stdout += chunk;
    if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) {
      oversized = true;
      stdout = "";
      child.kill();
    }
  });
  child.stderr.resume();
  child.once("error", () => resolveResult({ code: null, stdout: "", oversized: false, spawnError: true }));
  child.once("close", (code) => resolveResult({ code, stdout, oversized, spawnError: false }));
});

if (childResult.spawnError) fail("CANARY_TEST_START_FAILED");
if (childResult.oversized) fail("CANARY_TEST_OUTPUT_REJECTED");
if (childResult.code !== 0) fail("CANARY_TEST_FAILED");

const resultLines = childResult.stdout
  .split(/\r?\n/)
  .filter((line) => line.startsWith(RESULT_MARKER));
if (resultLines.length !== 1) fail("CANARY_EVIDENCE_REJECTED");

let evidence;
try {
  evidence = JSON.parse(resultLines[0].slice(RESULT_MARKER.length));
} catch {
  fail("CANARY_EVIDENCE_REJECTED");
}

if (!isRecord(evidence) || evidence.status !== "PASSED") fail("CANARY_EVIDENCE_REJECTED");
if (evidence.runId !== process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_RUN_ID) fail("CANARY_EVIDENCE_REJECTED");
if (evidence.locationId !== "third_avenue") fail("CANARY_EVIDENCE_REJECTED");
if (!isRecord(evidence.B) || evidence.B.variantId !== VARIANT_B || evidence.B.status !== "RELEASED") fail("CANARY_EVIDENCE_REJECTED");
if (!isStableId(evidence.B.quoteId) || !isStableId(evidence.B.capacityHoldId) || !isStableId(evidence.B.inventoryReservationId)) fail("CANARY_EVIDENCE_REJECTED");
if (!isRecord(evidence.A) || evidence.A.variantId !== VARIANT_A || evidence.A.status !== "CONFIRMED") fail("CANARY_EVIDENCE_REJECTED");
if (!isStableId(evidence.A.quoteId) || !isStableId(evidence.A.capacityHoldId) || !isStableId(evidence.A.inventoryReservationId) || !isStableId(evidence.A.orderId)) fail("CANARY_EVIDENCE_REJECTED");

process.stdout.write(`${JSON.stringify(evidence)}\n`);
