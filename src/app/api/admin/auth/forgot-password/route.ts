/** Starts database-backed Admin password recovery without revealing account existence. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { isTrustedMutationOrigin } from "@/server/admin/admin-security";
import {
  AdminPasswordResetUnavailableError,
  requestAdminPasswordReset
} from "@/server/admin/identity/admin-password-reset-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();

export async function POST(request: Request) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;
  if (!isTrustedMutationOrigin(request)) return response("This recovery request could not be verified.", 403);

  const parsed = bodySchema.safeParse(await safeJson(request));
  if (!parsed.success) return response("Enter a valid email address.", 400);
  const limiter = getAdminRateLimiter();
  const [addressLimit, accountLimit] = await Promise.all([
    limiter.consume({ key: clientAddress(request), scope: "admin-password-reset-address", limit: 5, windowMs: 15 * 60 * 1_000 }),
    limiter.consume({ key: parsed.data.email, scope: "admin-password-reset-account", limit: 3, windowMs: 60 * 60 * 1_000 })
  ]).catch(() => []);
  if (!addressLimit || !accountLimit) return response("Password recovery is temporarily unavailable.", 503);
  if (!addressLimit.allowed || !accountLimit.allowed) {
    return response("Too many recovery requests. Try again later.", 429, Math.max(addressLimit.retryAfterSeconds, accountLimit.retryAfterSeconds));
  }

  try {
    await requestAdminPasswordReset(parsed.data.email);
  } catch (error) {
    if (error instanceof AdminPasswordResetUnavailableError) return response(error.message, 503);
    console.warn("[admin-password-reset] Recovery request failed.");
    return response("Password recovery is temporarily unavailable.", 503);
  }
  return NextResponse.json({ ok: true, message: "If an active Admin account uses that email, a reset link has been sent." }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
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
