/** Serves the capability-filtered Storefront activity bell for the current Admin identity. */

import { NextRequest, NextResponse } from "next/server";
import {
  adminAuthorizationResponse,
  adminCapabilities,
  authorizeAdminRequest
} from "@/server/admin/admin-security";
import {
  markAllAdminStorefrontNotificationsRead,
  readAdminStorefrontNotifications
} from "@/server/admin/admin-storefront-notification-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.access);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const feed = await readAdminStorefrontNotifications({
    adminUserId: authorization.session.subject,
    capabilities: authorization.session.capabilities
  });
  return NextResponse.json(
    { ok: feed.available, ...feed },
    { status: feed.available ? 200 : 503, headers: privateHeaders }
  );
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.access);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_REQUEST", message: "A JSON request body is required." },
      { status: 400, headers: privateHeaders }
    );
  }
  if (!isMarkAllReadRequest(body)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_REQUEST", message: "Only mark_all_read is supported." },
      { status: 400, headers: privateHeaders }
    );
  }

  const result = await markAllAdminStorefrontNotificationsRead({
    adminUserId: authorization.session.subject
  });
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: privateHeaders
  });
}

function isMarkAllReadRequest(value: unknown): value is { action: "mark_all_read" } {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "action" in value &&
    value.action === "mark_all_read"
  );
}
