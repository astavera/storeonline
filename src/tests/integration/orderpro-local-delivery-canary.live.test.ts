// @vitest-environment node

import { describe, expect, test } from "vitest";
import { orderProAddressSchema } from "@/server/orderpro/contracts";
import {
  ORDERPRO_LOCAL_DELIVERY_CANARY_EXECUTION_FLAG,
  ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID,
  ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS,
  runPrivateOrderProLocalDeliveryCanary
} from "@/server/orderpro/local-delivery-canary-orchestrator";
import { getRuntimeOrderProClient } from "@/server/orderpro/runtime";

const RESULT_MARKER = "ORDERPRO_LOCAL_DELIVERY_CANARY_RESULT=";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

const liveDescribe = process.env.ORDERPRO_RUN_LOCAL_DELIVERY_CANARY === "true" ? describe : describe.skip;

function gate(condition: boolean): asserts condition {
  if (!condition) throw new Error("CANARY_GATE_REJECTED");
}

function parseAddress(raw: string) {
  try {
    return orderProAddressSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("CANARY_INPUT_REJECTED");
  }
}

function parseAllowedSlots(raw: string) {
  const slots = raw.split(",").map((slot) => slot.trim()).filter(Boolean);
  gate(slots.length > 0);
  gate(new Set(slots).size === slots.length);
  gate(slots.every((slot) => STABLE_ID_PATTERN.test(slot)));
  return slots;
}

liveDescribe("OrderPRO ST72 local-delivery live canary", () => {
  test("releases B before confirming A without Square checkout", async () => {
    gate(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_CONFIRMATION === ORDERPRO_LOCAL_DELIVERY_CANARY_EXECUTION_FLAG);
    gate(process.env.ORDERPRO_INTEGRATION_ENVIRONMENT === "STAGING");
    gate(process.env.ORDERPRO_M2M_AUTH_MODE === "AUTH0");
    gate(process.env.ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED === "false");
    gate(process.env.SQUARE_CHECKOUT_ENABLED === "false");
    gate(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_VARIANT_A === ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A);
    gate(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_VARIANT_B === ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B);

    const runId = process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_RUN_ID ?? "";
    gate(UUID_PATTERN.test(runId));
    const runtime = getRuntimeOrderProClient();
    if (!runtime.ready) throw new Error("CANARY_RUNTIME_NOT_READY");

    const result = await runPrivateOrderProLocalDeliveryCanary({
      client: runtime.client,
      runId,
      integrationEnvironment: process.env.ORDERPRO_INTEGRATION_ENVIRONMENT,
      executionFlag: process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_CONFIRMATION,
      variationAId: process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_VARIANT_A,
      variationBId: process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_VARIANT_B,
      allowedSlotIds: parseAllowedSlots(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_ALLOWED_SLOT_IDS ?? ""),
      address: parseAddress(process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_ADDRESS_JSON ?? ""),
      requestedDate: process.env.ORDERPRO_LOCAL_DELIVERY_CANARY_REQUESTED_DATE ?? ""
    });

    expect(result.status).toBe("PASSED");
    expect(result.locationId).toBe(ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID);
    expect(result.sequence).toEqual(["B_CANCEL", "A_SUCCESS"]);
    expect(result.cancelled.status).toBe("RELEASED");
    expect(result.confirmed.status).toBe("CONFIRMED");

    process.stdout.write(`${RESULT_MARKER}${JSON.stringify({
      status: result.status,
      runId: result.runId,
      locationId: result.locationId,
      B: result.cancelled,
      A: result.confirmed
    })}\n`);
  });
});
