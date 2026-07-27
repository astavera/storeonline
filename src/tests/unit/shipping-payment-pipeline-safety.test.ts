import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("shipping payment pipeline safety", () => {
  it("reserves before Square, persists correlation, and confirms from payment.updated", () => {
    const checkout = source("src/app/api/checkout/route.ts");
    const webhook = source("src/server/webhooks/square-webhook-handler.ts");
    const confirmation = source("src/server/webhooks/shipping-payment-confirmation.ts");

    expect(checkout.indexOf("shippingClient.create")).toBeLessThan(
      checkout.indexOf("squareCheckout = await createSquareHostedCheckout")
    );
    expect(checkout).toContain("recordShippingReservation");
    expect(checkout).toContain("recordHostedCheckout");
    expect(checkout.indexOf("attemptRepository.recordHostedCheckout")).toBeLessThan(
      checkout.indexOf("await shippingClient.bind")
    );
    expect(webhook).toContain('record.eventType === "payment.updated"');
    expect(confirmation).toContain('payment.status !== "COMPLETED"');
    expect(confirmation).toContain("client.payments.get");
    expect(confirmation).toContain("client.orders.get");
    expect(confirmation).toContain("orderPro.confirm");
  });

  it("never purchases a Shippo label in checkout or post-payment processing", () => {
    const sources = [
      "src/app/api/checkout/route.ts",
      "src/server/webhooks/shipping-payment-confirmation.ts",
      "src/server/checkout/shipping-checkout-cleanup.ts",
      "src/server/orderpro/shipping-order-client.ts"
    ].map(source).join("\n");

    expect(sources).not.toMatch(/api\.goshippo\.com.*transactions|["'`]\/transactions\/?["'`]/i);
    expect(sources).not.toMatch(/labelUrl|trackingNumber/);
  });

  it("closes a Square link before releasing an expired reservation", () => {
    const cleanup = source("src/server/checkout/shipping-checkout-cleanup.ts");
    expect(cleanup.indexOf("deleteSquareHostedCheckoutLink")).toBeLessThan(
      cleanup.indexOf("orderPro.release")
    );
    expect(cleanup).toContain("paymentAfterDelete");
  });
});
