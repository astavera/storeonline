import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  SquareCatalogSyncBusyError,
  SquareProductionSyncDisabledError,
  syncConfiguredSquareCatalogChanges
} from "@/server/square/catalog-postgres-sync";
import { syncConfiguredSquareInventoryCounts } from "@/server/square/inventory-postgres-sync";
import { authorizeWebhookWorker } from "@/server/webhooks/webhook-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeWebhookWorker(request)) {
    return NextResponse.json({ ok: false, error: "WORKER_UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const catalog = await syncConfiguredSquareCatalogChanges();
    const inventory = await syncConfiguredSquareInventoryCounts();
    return NextResponse.json(
      { ok: true, catalog, inventory },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { subsystem: "square-catalog-sync" } });
    const status = error instanceof SquareCatalogSyncBusyError
      ? 409
      : error instanceof SquareProductionSyncDisabledError
        ? 403
        : error instanceof PersistenceUnavailableError
          ? 503
          : 502;
    const code = error instanceof SquareCatalogSyncBusyError
      ? "SQUARE_SYNC_BUSY"
      : error instanceof SquareProductionSyncDisabledError
        ? "SQUARE_PRODUCTION_SYNC_DISABLED"
        : "SQUARE_SYNC_FAILED";
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
