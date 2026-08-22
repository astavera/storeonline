/**
 * Handles HTTP requests for the API admin auth login endpoint.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { safeAdminReturnTo } from "@/lib/security/admin-return-to";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { isAdminLoginConfigured, verifyAdminCredentials } from "@/server/admin/admin-login";
import { adminSessionCookieName, createAdminSessionToken, isTrustedMutationOrigin } from "@/server/admin/admin-security";
import { roleSessionCapabilities } from "@/server/admin/identity";
import { authenticateDatabaseAdmin, isDatabaseAdminIdentityEnabled } from "@/server/admin/identity/admin-database-login";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(512),
  mfaCode: z.string().trim().max(64).optional(),
  returnTo: z.string().max(500).optional()
});

const sessionLifetimeSeconds = 8 * 60 * 60;
const maximumLoginBodyBytes = 16 * 1024;

type LoginBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; status: 400 | 413 };

export async function POST(request: Request) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  if (!isTrustedMutationOrigin(request)) {
    return loginError("This login request could not be verified.", 403);
  }

  let attemptRateLimit;
  try {
    attemptRateLimit = await getAdminRateLimiter().consume({
      key: clientAddress(request),
      scope: "admin-login-attempt",
      limit: 20,
      windowMs: 60_000
    });
  } catch {
    return loginError("Admin login is temporarily unavailable.", 503);
  }

  if (!attemptRateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(attemptRateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const body = await readLoginBody(request);
  if (!body.ok) return loginError(body.error, body.status);

  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) {
    return loginError("Enter a valid email and password.", 400);
  }

  if (!isAdminLoginConfigured()) {
    return loginError("Admin login has not been configured.", 503);
  }

  const databaseIdentityEnabled = isDatabaseAdminIdentityEnabled();
  let databaseSession: Awaited<ReturnType<typeof authenticateDatabaseAdmin>> = null;
  try {
    databaseSession = databaseIdentityEnabled
      ? await authenticateDatabaseAdmin({
          email: parsed.data.email,
          password: parsed.data.password,
          mfaCode: parsed.data.mfaCode,
          clientAddress: clientAddress(request),
          userAgent: request.headers.get("user-agent")
        })
      : null;
  } catch (error) {
    console.warn("[admin-login] Database identity authentication is unavailable.", error);
    return loginError("Admin login is temporarily unavailable.", 503);
  }

  if (databaseIdentityEnabled ? !databaseSession : !verifyAdminCredentials(parsed.data.email, parsed.data.password)) {
    let rateLimit;
    try {
      rateLimit = await getAdminRateLimiter().consume({
        key: `${clientAddress(request)}:${parsed.data.email.toLowerCase()}`,
        scope: "admin-login",
        limit: 5,
        windowMs: 15 * 60 * 1000
      });
    } catch {
      return loginError("Admin login is temporarily unavailable.", 503);
    }

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many failed login attempts. Enter the correct credentials or try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    // The private preview is also protected by HTTP Basic authentication.
    // Returning 401 here makes browsers discard those gateway credentials,
    // so the next attempt receives Caddy's non-JSON authentication challenge.
    return loginError(databaseIdentityEnabled ? "Email, password, or MFA code is incorrect." : "Email or password is incorrect.", 403);
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!databaseSession && !secret) return loginError("Admin login has not been configured.", 503);
  const expiresAt = databaseSession ? Math.floor(databaseSession.expiresAt.getTime() / 1000) : Math.floor(Date.now() / 1000) + sessionLifetimeSeconds;
  const token = databaseSession?.token ?? createAdminSessionToken({
    subject: parsed.data.email.trim().toLowerCase(),
    capabilities: [...roleSessionCapabilities("OWNER")],
    expiresAt,
    secret: secret!
  });
  const returnTo = safeAdminReturnTo(parsed.data.returnTo);
  const response = NextResponse.json({ ok: true, returnTo }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(adminSessionCookieName, token, {
    httpOnly: true,
    maxAge: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}

function loginError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

async function readLoginBody(request: Request): Promise<LoginBodyResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return { ok: false, error: "Enter a valid email and password.", status: 400 };
    }
    if (parsedLength > maximumLoginBodyBytes) {
      return { ok: false, error: "This login request is too large.", status: 413 };
    }
  }

  if (!request.body) return { ok: true, value: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      totalBytes += chunk.value.byteLength;
      if (totalBytes > maximumLoginBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "This login request is too large.", status: 413 };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { ok: false, error: "Enter a valid email and password.", status: 400 };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: true, value: null };
  }
}
