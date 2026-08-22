/** Read and controlled-retry API for the durable webhook inbox. */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { readAdminWebhookEvents, requeueAdminWebhookEvent } from "@/server/admin/admin-webhook-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const retrySchema = z.object({ action: z.literal("requeue"), id: z.string().trim().min(1).max(160) }).strict();

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "integrations:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  const result = await readAdminWebhookEvents({ provider: request.nextUrl.searchParams.get("provider") || undefined, status: request.nextUrl.searchParams.get("status") || undefined, page: Number(request.nextUrl.searchParams.get("page") || 1) });
  return NextResponse.json({ ok: result.available, ...result }, { status: result.available ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "integrations:retry");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Select a valid webhook event." }, { status: 400 });
  const requeued = await requeueAdminWebhookEvent({ id: parsed.data.id, actorSubject: authorization.session.subject });
  return NextResponse.json({ ok: requeued, error: requeued ? undefined : "Only failed or dead-letter events can be requeued." }, { status: requeued ? 200 : 409, headers: { "Cache-Control": "private, no-store" } });
}
