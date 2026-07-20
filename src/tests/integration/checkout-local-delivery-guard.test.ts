// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/route";

vi.mock("@/server/square/client", () => ({
  getSquareRuntimeConfig: () => ({ environment: "sandbox", hasAccessToken: false, hasApplicationId: false })
}));

function checkoutRequest(fulfillmentMode: "pickup" | "local-delivery" | "shipping") {
  return new NextRequest("https://store.example/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }],
      fulfillmentMode,
      customer: {
        name: "Test Customer",
        email: "customer@example.com",
        phone: "2125550100"
      }
    })
  });
}

describe("checkout Local Delivery release guard", () => {
  it("fails closed before payment setup while the OrderPRO flow is unreleased", async () => {
    const response = await POST(checkoutRequest("local-delivery"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      status: "local_delivery_not_available",
      errors: ["Local delivery checkout is not available yet. Please select pickup or shipping."]
    });
  });

  it.each(["pickup", "shipping"] as const)("does not intercept the existing %s flow", async (fulfillmentMode) => {
    const response = await POST(checkoutRequest(fulfillmentMode));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "payment_setup_required"
    });
    expect(body.status).not.toBe("local_delivery_not_available");
  });
});
