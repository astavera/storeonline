/** Completes a single-use Store Admin password reset and revokes old sessions. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { isTrustedMutationOrigin } from "@/server/admin/admin-security";
import {
  AdminPasswordResetInvalidError,
  completeAdminPasswordReset
} from "@/server/admin/identity/admin-password-reset-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const bodySchema = z.object({
  token: z.string().trim().length(43).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(12).max(512)
}).strict();

export async function POST(request: Request) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;
  if (!isTrustedMutationOrigin(request)) return response("This reset request could not be verified.", 403);
  const rateLimit = await getAdminRateLimiter().consume({ key: clientAddress(request), scope: "admin-password-reset-complete", limit: 10, windowMs: 15 * 60 * 1_000 }).catch(() => null);
  if (!rateLimit) return response("Password reset is temporarily unavailable.", 503);
  if (!rateLimit.allowed) return response("Too many reset attempts. Try again later.", 429, rateLimit.retryAfterSeconds);
  const parsed = bodySchema.safeParse(await safeJson(request));
  if (!parsed.success) return response("Enter valid password reset details.", 400);
  try {
    await completeAdminPasswordReset(parsed.data);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AdminPasswordResetInvalidError) return response(error.message, 404);
    console.warn("[admin-password-reset] Reset completion failed.");
    return response("Password reset is temporarily unavailable.", 503);
  }
}

function response(error: string, status: number, retryAfter?: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
}

async function safeJson(request: Request) {
  try { return await request.json() as unknown; } catch { return null; }
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}
