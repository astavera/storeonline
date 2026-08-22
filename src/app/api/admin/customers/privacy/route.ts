import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { addAdminCustomerNote, createAdminCustomerDataExport, createAdminCustomerDeletionRequest, CustomerPrivacyError, readAdminCustomerPrivacyProfile, updateAdminCustomerPrivacyRequest } from "@/server/admin/admin-customer-privacy-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_note"), customerId: z.string().trim().min(1).max(100), body: z.string().trim().min(2).max(2_000) }).strict(),
  z.object({ action: z.literal("request_deletion"), customerId: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("update_request"), requestId: z.string().trim().min(1).max(100), status: z.enum(["IN_REVIEW", "COMPLETED", "REJECTED"]), resolutionNote: z.string().trim().min(3).max(1_000) }).strict()
]);

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;
  const customerId = request.nextUrl.searchParams.get("customerId")?.trim();
  if (!customerId || customerId.length > 100) return NextResponse.json({ ok: false, error: "Select a valid customer." }, { status: 400 });
  const exportRequested = request.nextUrl.searchParams.get("mode") === "export";
  const authorization = await authorizeAdminRequest(request, exportRequested ? "customers:privacy.manage" : "customers:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  try {
    if (exportRequested) {
      const data = await createAdminCustomerDataExport({ customerId, actorSubject: authorization.session.subject });
      return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="customer-${safeFilePart(customerId)}-export.json"`, "X-Content-Type-Options": "nosniff" } });
    }
    const profile = await readAdminCustomerPrivacyProfile(customerId);
    return NextResponse.json({ ok: Boolean(profile), profile }, { status: profile ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Customer privacy data is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;
  const parsed = mutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Enter a valid customer privacy action." }, { status: 400 });
  const permission = parsed.data.action === "add_note" ? "customers:notes.write" : "customers:privacy.manage";
  const authorization = await authorizeAdminRequest(request, permission);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  try {
    const result = parsed.data.action === "add_note"
      ? await addAdminCustomerNote({ ...parsed.data, actorSubject: authorization.session.subject })
      : parsed.data.action === "request_deletion"
        ? await createAdminCustomerDeletionRequest({ ...parsed.data, actorSubject: authorization.session.subject })
        : await updateAdminCustomerPrivacyRequest({ ...parsed.data, actorSubject: authorization.session.subject });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof CustomerPrivacyError ? error.message : "The customer privacy action could not be completed.";
    const status = error instanceof CustomerPrivacyError && error.code === "OPEN_REQUEST_EXISTS" ? 409 : error instanceof CustomerPrivacyError && error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}

function safeFilePart(value: string) { return value.replaceAll(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80); }
