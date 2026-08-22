/** Read-only, secret-free integration health assembled from real configuration and sync state. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";
import { getOperationsAccessRuntime } from "@/server/operations-access";
import { getOrderProM2mConfiguration } from "@/server/orderpro/config";
import { getSquareRuntimeConfig } from "@/server/square/client";

export type IntegrationHealthState = "healthy" | "warning" | "unavailable" | "disabled";

export type IntegrationHealthItem = {
  id: string;
  label: string;
  authority: "Square" | "Operations" | "Shippo" | "Store Admin";
  state: IntegrationHealthState;
  summary: string;
  lastEventAt: string | null;
};

export type AdminIntegrationHealth = {
  checkedAt: string;
  databaseAvailable: boolean;
  items: IntegrationHealthItem[];
  webhookFailures: number;
  webhookDeadLetters: number;
};

export async function readAdminIntegrationHealth(): Promise<AdminIntegrationHealth> {
  const checkedAt = new Date();
  const square = getSquareRuntimeConfig();
  const orderPro = getOrderProM2mConfiguration();
  const operationsAccess = getOperationsAccessRuntime();
  const shippoConfigured = Boolean(process.env.SHIPPO_API_TOKEN?.trim());
  let databaseAvailable = false;
  let catalogLastCompletedAt: Date | null = null;
  let catalogLastError: string | null = null;
  let inventoryLastSyncedAt: Date | null = null;
  let webhookFailures = 0;
  let webhookDeadLetters = 0;
  let webhookLastEventAt: Date | null = null;

  if (process.env.DATABASE_URL) {
    try {
      const prisma = getPrismaClient();
      const [catalogSync, inventorySync, webhookGroups, latestWebhook] = await Promise.all([
        prisma.squareCatalogSyncState.findUnique({ where: { environment: square.environment } }),
        prisma.squareInventoryCount.aggregate({ _max: { syncedAt: true } }),
        prisma.webhookInboxEvent.groupBy({
          by: ["status"],
          where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
          _count: { _all: true }
        }),
        prisma.webhookInboxEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } })
      ]);
      databaseAvailable = true;
      catalogLastCompletedAt = catalogSync?.lastCompletedAt ?? null;
      catalogLastError = catalogSync?.lastError ?? null;
      inventoryLastSyncedAt = inventorySync._max.syncedAt;
      webhookFailures = webhookGroups.find((group) => group.status === "FAILED")?._count._all ?? 0;
      webhookDeadLetters = webhookGroups.find((group) => group.status === "DEAD_LETTER")?._count._all ?? 0;
      webhookLastEventAt = latestWebhook?.receivedAt ?? null;
    } catch (error) {
      console.warn("[admin-health] Could not read integration persistence health.", error);
    }
  }

  const items: IntegrationHealthItem[] = [
    squareCatalogHealth({ configured: square.hasAccessToken, lastCompletedAt: catalogLastCompletedAt, lastError: catalogLastError, now: checkedAt }),
    freshnessHealth({ id: "square-inventory", label: "Inventory mirror", configured: square.hasAccessToken, lastEventAt: inventoryLastSyncedAt, now: checkedAt }),
    {
      id: "orderpro-checkout",
      label: "Operations checkout contract",
      authority: "Operations",
      state: orderPro.enabled ? "warning" : orderPro.state === "INVALID" ? "unavailable" : "disabled",
      summary: orderPro.enabled
        ? "Staging local-delivery scopes are configured; fulfillment execution remains in Operations."
        : orderPro.state === "INVALID" ? "Operations delivery configuration is invalid." : "Operations delivery integration is disabled.",
      lastEventAt: null
    },
    {
      id: "operations-identity",
      label: "Operations user access",
      authority: "Operations",
      state: operationsAccess.ready ? "healthy" : "unavailable",
      summary: operationsAccess.ready
        ? "The access-assignment API contract is configured. Active status still requires an exact external confirmation."
        : "No confirmed Operations user-management API or SSO contract is installed; assignments remain unavailable.",
      lastEventAt: null
    },
    {
      id: "shippo",
      label: "Shippo shipping",
      authority: "Shippo",
      state: shippoConfigured ? process.env.SHIPPO_TEST_MODE === "true" ? "warning" : "healthy" : "disabled",
      summary: shippoConfigured
        ? process.env.SHIPPO_TEST_MODE === "true" ? "Configured in test mode." : "Server-side credential is configured; no secret value is exposed."
        : "Shippo is not configured.",
      lastEventAt: null
    },
    {
      id: "webhooks",
      label: "Webhook inbox",
      authority: "Store Admin",
      state: !databaseAvailable ? "unavailable" : webhookDeadLetters > 0 ? "unavailable" : webhookFailures > 0 ? "warning" : "healthy",
      summary: !databaseAvailable
        ? "Webhook persistence could not be inspected."
        : `${webhookFailures} failed and ${webhookDeadLetters} dead-letter events require attention.`,
      lastEventAt: webhookLastEventAt?.toISOString() ?? null
    }
  ];

  return { checkedAt: checkedAt.toISOString(), databaseAvailable, items, webhookFailures, webhookDeadLetters };
}

function squareCatalogHealth(input: { configured: boolean; lastCompletedAt: Date | null; lastError: string | null; now: Date }): IntegrationHealthItem {
  if (!input.configured) return { id: "square-catalog", label: "Square catalog mirror", authority: "Square", state: "disabled", summary: "Square read synchronization is not configured.", lastEventAt: null };
  if (input.lastError) return { id: "square-catalog", label: "Square catalog mirror", authority: "Square", state: "unavailable", summary: "The latest catalog sync recorded an error. Review server logs before retrying.", lastEventAt: input.lastCompletedAt?.toISOString() ?? null };
  return freshnessHealth({ id: "square-catalog", label: "Square catalog mirror", configured: true, lastEventAt: input.lastCompletedAt, now: input.now });
}

function freshnessHealth(input: { id: string; label: string; configured: boolean; lastEventAt: Date | null; now: Date }): IntegrationHealthItem {
  if (!input.configured) return { id: input.id, label: input.label, authority: "Square", state: "disabled", summary: "The Square read connection is not configured.", lastEventAt: null };
  if (!input.lastEventAt) return { id: input.id, label: input.label, authority: "Square", state: "warning", summary: "Configured, but no completed synchronization is recorded.", lastEventAt: null };
  const stale = input.now.getTime() - input.lastEventAt.getTime() > 24 * 60 * 60 * 1_000;
  return { id: input.id, label: input.label, authority: "Square", state: stale ? "warning" : "healthy", summary: stale ? "The last synchronization is older than 24 hours." : "The read mirror has a recent successful synchronization.", lastEventAt: input.lastEventAt.toISOString() };
}
