/**
 * Handles HTTP requests for the API admin merchandising endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";
import {
  auditWebsiteMerchandisingPublication,
  publishWebsiteMerchandising,
  WebsiteMerchandisingPublicationError
} from "@/server/admin/website-merchandising-publication";
import {
  readAdminWebsiteMerchandisingWorkspace,
  saveWebsiteMerchandisingSnapshot
} from "@/server/admin/website-merchandising-store";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { readPostgresAdminCatalogSummary } from "@/server/square/postgres-admin-catalog-store";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const [catalog, workspace] = await Promise.all([
    readPostgresAdminCatalogSummary(),
    readAdminWebsiteMerchandisingWorkspace()
  ]);

  return NextResponse.json(
    {
      ok: true,
      config: workspace.config,
      workspace: workspaceInfo(workspace),
      productCount: catalog.variationCount,
      fetchedAt: catalog.updatedAt ?? workspace.config.updatedAt
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    await saveWebsiteMerchandisingSnapshot(body.config);
    const workspace = await readAdminWebsiteMerchandisingWorkspace();

    return NextResponse.json({ ok: true, config: workspace.config, workspace: workspaceInfo(workspace) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "The merchandising configuration is invalid.",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        },
        { status: 400 }
      );
    }

    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save web merchandising." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingPublish);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "plan_publication") {
      const plan = await auditWebsiteMerchandisingPublication();
      return NextResponse.json({ ok: true, plan }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (action !== "publish") {
      return NextResponse.json({ ok: false, error: "Unsupported merchandising action." }, { status: 400 });
    }

    const rateLimit = await getAdminRateLimiter().consume({
      key: `${authorization.session.subject}:website-merchandising`,
      scope: "admin-merchandising-publish",
      limit: 3,
      windowMs: 60_000
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: `Too many publish attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`, retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const result = await publishWebsiteMerchandising(String(body.confirmation ?? ""));
    const workspace = await readAdminWebsiteMerchandisingWorkspace();
    return NextResponse.json({ ok: true, result, workspace: workspaceInfo(workspace) });
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to publish website merchandising." }, { status: 500 });
  }
}

function workspaceInfo(workspace: Awaited<ReturnType<typeof readAdminWebsiteMerchandisingWorkspace>>) {
  return {
    status: workspace.status,
    versionNumber: workspace.versionNumber,
    publishedVersionNumber: workspace.publishedVersionNumber,
    publishedUpdatedAt: workspace.publishedUpdatedAt
  };
}
