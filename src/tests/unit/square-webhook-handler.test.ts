/**
 * Verifies the isolated behavior of Square webhook handler.
 */

import { describe, expect, it, vi } from "vitest";
import { createSquareWebhookHandler } from "@/server/webhooks/square-webhook-handler";

function record(eventType: string, payload: unknown) {
  return {
    id: "inbox-1",
    provider: "square",
    eventId: "event-1",
    eventType,
    payload,
    status: "PROCESSING" as const,
    attempts: 1,
    lockToken: "lease",
    duplicate: false
  };
}

describe("Square webhook handler", () => {
  it("projects the documented inventory payload", async () => {
    const applyInventoryCounts = vi.fn().mockResolvedValue(undefined);
    const handler = createSquareWebhookHandler({
      applyInventoryCounts,
      synchronizeCatalog: vi.fn(),
      confirmCompletedShippingPayment: vi.fn()
    });
    await handler(record("inventory.count.updated", {
      data: {
        object: {
          inventory_counts: [{
            calculated_at: "2026-07-15T12:00:00Z",
            catalog_object_id: "variation-1",
            catalog_object_type: "ITEM_VARIATION",
            location_id: "location-1",
            quantity: "9.5",
            state: "IN_STOCK"
          }]
        }
      }
    }));

    expect(applyInventoryCounts).toHaveBeenCalledWith([expect.objectContaining({ catalog_object_id: "variation-1", quantity: "9.5" })]);
  });

  it("requests an incremental catalog sync and rejects unknown events", async () => {
    const synchronizeCatalog = vi.fn().mockResolvedValue(undefined);
    const handler = createSquareWebhookHandler({
      applyInventoryCounts: vi.fn(),
      synchronizeCatalog,
      confirmCompletedShippingPayment: vi.fn()
    });

    await handler(record("catalog.version.updated", {}));
    expect(synchronizeCatalog).toHaveBeenCalledOnce();
    await expect(handler(record("customer.updated", {}))).rejects.toThrow("Unsupported Square webhook event type");
  });

  it("confirms only completed payments and never creates orders from order.updated", async () => {
    const confirmCompletedShippingPayment = vi.fn().mockResolvedValue(undefined);
    const confirmCompletedCapacityPayment = vi.fn().mockResolvedValue(undefined);
    const handler = createSquareWebhookHandler({
      applyInventoryCounts: vi.fn(),
      synchronizeCatalog: vi.fn(),
      confirmCompletedShippingPayment,
      confirmCompletedCapacityPayment
    });
    const payment = (status: string) => ({
      data: { object: { payment: { id: "payment-1", status } } }
    });

    await handler(record("payment.updated", payment("PENDING")));
    expect(confirmCompletedShippingPayment).not.toHaveBeenCalled();
    expect(confirmCompletedCapacityPayment).not.toHaveBeenCalled();

    await handler(record("payment.updated", payment("COMPLETED")));
    expect(confirmCompletedShippingPayment).toHaveBeenCalledWith("payment-1");
    expect(confirmCompletedCapacityPayment).toHaveBeenCalledWith("payment-1");

    await handler(record("order.updated", {}));
    expect(confirmCompletedShippingPayment).toHaveBeenCalledTimes(1);
    expect(confirmCompletedCapacityPayment).toHaveBeenCalledTimes(1);
  });
});
