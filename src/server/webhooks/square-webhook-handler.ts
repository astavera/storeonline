/**
 * Implements server-side Square webhook handler behavior and persistence boundaries.
 */

import "server-only";

import { z } from "zod";
import { syncConfiguredSquareCatalogChanges } from "@/server/square/catalog-postgres-sync";
import { persistSquareInventorySnapshots } from "@/server/square/inventory-postgres-sync";
import type { WebhookInboxRecord } from "@/server/webhooks/webhook-inbox";
import type { WebhookEventHandler } from "@/server/webhooks/webhook-processor";
import { confirmCompletedShippingPayment } from "@/server/webhooks/shipping-payment-confirmation";

const inventoryWebhookSchema = z.object({
  data: z.object({
    object: z.object({
      inventory_counts: z.array(z.object({
        calculated_at: z.string().datetime({ offset: true }),
        catalog_object_id: z.string().trim().min(1),
        catalog_object_type: z.literal("ITEM_VARIATION"),
        location_id: z.string().trim().min(1),
        quantity: z.string().regex(/^-?\d+(?:\.\d+)?$/),
        state: z.string().trim().min(1)
      })).min(1).max(100)
    })
  })
});

const paymentWebhookSchema = z.object({
  data: z.object({
    object: z.object({
      payment: z.object({
        id: z.string().trim().min(1),
        status: z.string().trim().min(1)
      }).passthrough()
    }).passthrough()
  }).passthrough()
}).passthrough();

const refundWebhookSchema = z.object({
  data: z.object({
    object: z.object({
      refund: z.object({
        id: z.string().trim().min(1),
        status: z.string().trim().min(1)
      }).passthrough()
    }).passthrough()
  }).passthrough()
}).passthrough();

export type SquareInventoryProjection = z.infer<typeof inventoryWebhookSchema>["data"]["object"]["inventory_counts"][number];

export type SquareWebhookOperations = {
  applyInventoryCounts(counts: SquareInventoryProjection[]): Promise<void>;
  synchronizeCatalog(): Promise<void>;
  confirmCompletedShippingPayment(paymentId: string): Promise<void>;
  applyReturnRefundStatus?(refundId: string, status: string): Promise<void>;
};

export function createSquareWebhookHandler(operations: SquareWebhookOperations): WebhookEventHandler {
  return async function squareWebhookHandler(record: WebhookInboxRecord) {
    if (record.eventType === "inventory.count.updated") {
      const payload = inventoryWebhookSchema.parse(record.payload);
      await operations.applyInventoryCounts(payload.data.object.inventory_counts);
      return;
    }
    if (record.eventType === "catalog.version.updated") {
      await operations.synchronizeCatalog();
      return;
    }
    if (record.eventType === "payment.updated") {
      const payload = paymentWebhookSchema.parse(record.payload);
      if (payload.data.object.payment.status === "COMPLETED") {
        await operations.confirmCompletedShippingPayment(payload.data.object.payment.id);
      }
      return;
    }
    if (record.eventType === "refund.updated") {
      const payload = refundWebhookSchema.parse(record.payload);
      await operations.applyReturnRefundStatus?.(
        payload.data.object.refund.id,
        payload.data.object.refund.status
      );
      return;
    }
    if (record.eventType === "order.updated") {
      // Payment confirmation is the only creator of operational orders.
      // Order updates will later synchronize fulfillment state, never create a
      // second OrderPRO order.
      return;
    }
    throw new Error(`Unsupported Square webhook event type: ${record.eventType}`);
  };
}

const productionOperations: SquareWebhookOperations = {
  async applyInventoryCounts(counts) {
    await persistSquareInventorySnapshots(counts.map((count) => ({
      variationId: count.catalog_object_id,
      squareLocationId: count.location_id,
      state: count.state,
      quantity: count.quantity,
      calculatedAt: new Date(count.calculated_at)
    })));
  },

  async synchronizeCatalog() {
    await syncConfiguredSquareCatalogChanges();
  },

  async confirmCompletedShippingPayment(paymentId) {
    await confirmCompletedShippingPayment(paymentId);
  },

  async applyReturnRefundStatus(refundId, status) {
    const { getReturnsRepository } = await import("@/server/returns/return-repository");
    await getReturnsRepository().applySquareRefundStatus({
      squareRefundId: refundId,
      squareStatus: status
    });
  }
};

export const handleSquareWebhookEvent = createSquareWebhookHandler(productionOperations);
