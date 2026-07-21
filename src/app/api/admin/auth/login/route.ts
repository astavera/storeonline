import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { isAdminLoginConfigured, verifyAdminCredentials } from "@/server/admin/admin-login";
import { adminSessionCookieName, createAdminSessionToken, isTrustedMutationOrigin } from "@/server/admin/admin-security";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(512),
  returnTo: z.string().max(500).optional()
});

const sessionLifetimeSeconds = 8 * 60 * 60;

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) {
    return loginError("This login request could not be verified.", 403);
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return loginError("Enter a valid email and password.", 400);
  }

  if (!isAdminLoginConfigured()) {
    return loginError("Admin login has not been configured.", 503);
  }

  if (!verifyAdminCredentials(parsed.data.email, parsed.data.password)) {
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

    return loginError("Email or password is incorrect.", 401);
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return loginError("Admin login has not been configured.", 503);

  const expiresAt = Math.floor(Date.now() / 1000) + sessionLifetimeSeconds;
  const token = createAdminSessionToken({
    subject: parsed.data.email.trim().toLowerCase(),
    capabilities: ["admin:*"],
    expiresAt,
    secret
  });
  const returnTo = safeAdminReturnTo(parsed.data.returnTo);
  const response = NextResponse.json({ ok: true, returnTo }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(adminSessionCookieName, token, {
    httpOnly: true,
    maxAge: sessionLifetimeSeconds,
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

function safeAdminReturnTo(value?: string) {
  if (!value || !value.startsWith("/admin") || value.startsWith("/admin/login") || value.startsWith("//")) return "/admin";
  return value;
}
