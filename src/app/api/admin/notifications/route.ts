import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { AdminNotificationError, adminNotificationDefinitions, readAdminNotificationWorkspace, saveAdminNotificationTemplate, sendAdminNotificationTest } from "@/server/admin/admin-notification-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const keys = adminNotificationDefinitions.map(({ key }) => key) as [typeof adminNotificationDefinitions[number]["key"], ...Array<typeof adminNotificationDefinitions[number]["key"]>];
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["save_draft", "publish"]), key: z.enum(keys), subject: z.string().max(180), bodyText: z.string().max(10_000) }).strict(),
  z.object({ action: z.literal("test_send"), key: z.enum(keys), email: z.string().trim().email().max(254) }).strict()
]);

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "notifications:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  const workspace = await readAdminNotificationWorkspace();
  return NextResponse.json({ ok: workspace.available, ...workspace }, { status: workspace.available ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const body = mutation.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Enter a valid notification operation." }, { status: 400 });
  const permission = body.data.action === "test_send" ? "notifications:test-send" : "notifications:write";
  const authorization = await authorizeAdminRequest(request, permission);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  try {
    const result = body.data.action === "test_send"
      ? await sendAdminNotificationTest({ ...body.data, actorSubject: authorization.session.subject })
      : await saveAdminNotificationTemplate({ key: body.data.key, subject: body.data.subject, bodyText: body.data.bodyText, publish: body.data.action === "publish", actorSubject: authorization.session.subject });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof AdminNotificationError ? error.message : "The notification request could not be completed.";
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof AdminNotificationError && error.code === "PROVIDER_UNAVAILABLE" ? 503 : 400 });
  }
}
