/** Public, rate-limited endpoint for one-time Admin invitation activation. */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { isTrustedMutationOrigin } from "@/server/admin/admin-security";
import {
  AdminActivationError,
  beginAdminActivation,
  completeAdminActivation,
  readAdminInvitation
} from "@/server/admin/identity/admin-activation-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const tokenSchema = z.string().trim().length(43).regex(/^[A-Za-z0-9_-]+$/);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), token: tokenSchema, password: z.string().min(12).max(512) }).strict(),
  z.object({ action: z.literal("confirm"), token: tokenSchema, code: z.string().trim().regex(/^\d{6}$/) }).strict()
]);

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const token = tokenSchema.safeParse(request.nextUrl.searchParams.get("token"));
  if (!token.success) return activationError("This invitation is invalid or expired.", 404);
  const invitation = await readAdminInvitation(token.data).catch(() => null);
  return invitation
    ? NextResponse.json({ ok: true, invitation }, { headers: { "Cache-Control": "private, no-store" } })
    : activationError("This invitation is invalid or expired.", 404);
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  if (!isTrustedMutationOrigin(request)) return activationError("This activation request could not be verified.", 403);
  const rateLimit = await getAdminRateLimiter().consume({ key: clientAddress(request), scope: "admin-activation", limit: 10, windowMs: 15 * 60 * 1000 }).catch(() => null);
  if (!rateLimit) return activationError("Activation is temporarily unavailable.", 503);
  if (!rateLimit.allowed) return activationError("Too many activation attempts. Try again later.", 429, rateLimit.retryAfterSeconds);

  const parsed = actionSchema.safeParse(await safeJson(request));
  if (!parsed.success) return activationError("Enter valid activation details.", 400);
  try {
    const result = parsed.data.action === "setup"
      ? await beginAdminActivation(parsed.data)
      : await completeAdminActivation(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AdminActivationError) return activationError(error.message, error.code === "INVITATION_INVALID" ? 404 : 400);
    console.warn("[admin-activation] Activation failed.", error);
    return activationError("Activation is temporarily unavailable.", 503);
  }
}

async function safeJson(request: Request) {
  try { return await request.json() as unknown; } catch { return null; }
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function activationError(error: string, status: number, retryAfter?: number) {
  return NextResponse.json({ ok: false, error }, {
    status,
    headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) }
  });
}
