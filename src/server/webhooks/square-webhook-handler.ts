import "server-only";

import { z } from "zod";
import { syncConfiguredSquareCatalogChanges } from "@/server/square/catalog-postgres-sync";
import { persistSquareInventorySnapshots } from "@/server/square/inventory-postgres-sync";
import type { WebhookInboxRecord } from "@/server/webhooks/webhook-inbox";
import type { WebhookEventHandler } from "@/server/webhooks/webhook-processor";

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

export type SquareInventoryProjection = z.infer<typeof inventoryWebhookSchema>["data"]["object"]["inventory_counts"][number];

export type SquareWebhookOperations = {
  applyInventoryCounts(counts: SquareInventoryProjection[]): Promise<void>;
  synchronizeCatalog(): Promise<void>;
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
  }
};

export const handleSquareWebhookEvent = createSquareWebhookHandler(productionOperations);
