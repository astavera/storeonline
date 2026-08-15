/** Starts a passwordless customer account challenge. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { startCustomerLogin } from "@/server/customers/customer-account-service";
import { getCustomerRateLimiter } from "@/server/customers/customer-rate-limit";
import { isTrustedCustomerMutationOrigin, normalizeCustomerEmail } from "@/server/customers/customer-security";

const inputSchema = z.object({
  email: z.string().trim().email().max(254),
  termsAccepted: z.literal(true),
  marketingConsent: z.boolean().default(false)
}).strict();

export async function POST(request: Request) {
  if (!isTrustedCustomerMutationOrigin(request)) return accountError("This request could not be verified.", 403);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return accountError("Enter a valid email and accept the Terms of Use.", 400);

  const rateLimit = await getCustomerRateLimiter().consume({
    key: `${clientAddress(request)}:${normalizeCustomerEmail(parsed.data.email)}`,
    scope: "customer-login-start",
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many codes requested. Try again later." }, {
      status: 429,
      headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }

  try {
    const challenge = await startCustomerLogin({
      email: parsed.data.email,
      marketingConsent: parsed.data.marketingConsent,
      source: "account_drawer"
    });
    return noStoreJson({ ok: true, ...challenge });
  } catch {
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
