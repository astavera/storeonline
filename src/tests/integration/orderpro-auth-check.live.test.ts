// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isOrderProLocalDeliveryCheckoutEnabled, isOrderProLocalDeliveryCheckoutRequested } from "@/server/orderpro/config";
import { getRuntimeOrderProClient } from "@/server/orderpro/runtime";

const describeLive = process.env.ORDERPRO_RUN_LIVE_M2M_TEST === "true" ? describe : describe.skip;

describeLive("OrderPRO STAGING live M2M handshake", () => {
  it("authenticates the storefront while Local Delivery remains dependency-blocked", async () => {
    expect(isOrderProLocalDeliveryCheckoutRequested(process.env)).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutEnabled(process.env)).toBe(false);

    const runtime = getRuntimeOrderProClient();

    expect(runtime.ready).toBe(true);
    if (!runtime.ready) {
      throw new Error(`OrderPRO runtime is ${runtime.state}.`);
    }

    await expect(runtime.client.authCheck()).resolves.toMatchObject({
      result: "AUTHENTICATED",
      clientId: "storefront-staging",
      environment: "STAGING",
      scopes: ["local-delivery:holds", "local-delivery:quote"],
      localDeliveryApiStatus: "DEPENDENCY_BLOCKED"
    });
  });
});
