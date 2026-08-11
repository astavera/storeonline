/** Verifies a customer OTP and creates an opaque HttpOnly session. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { CustomerAuthenticationError, verifyCustomerLogin } from "@/server/customers/customer-account-service";
import { getCustomerRateLimiter } from "@/server/customers/customer-rate-limit";
import { customerSessionCookieName, customerSessionLifetimeSeconds, isTrustedCustomerMutationOrigin } from "@/server/customers/customer-security";

const inputSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/)
}).strict();

export async function POST(request: Request) {
  if (!isTrustedCustomerMutationOrigin(request)) return accountError("This request could not be verified.", 403);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return accountError("Enter the six-digit code from your email.", 400);

  const rateLimit = await getCustomerRateLimiter().consume({
    key: `${clientAddress(request)}:${parsed.data.challengeId}`,
    scope: "customer-login-verify",
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Request a new code." }, {
      status: 429,
      headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }

  try {
    const result = await verifyCustomerLogin(parsed.data);
    const response = noStoreJson({ ok: true, account: result.account });
    response.cookies.set(customerSessionCookieName, result.token, {
      httpOnly: true,
      maxAge: customerSessionLifetimeSeconds,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return accountError(error.message, 400);
    return accountError("Sign-in is temporarily unavailable. Please try again.", 503);
  }
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function accountError(error: string, status: number) {
  return noStoreJson({ ok: false, error }, status);
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
