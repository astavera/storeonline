/** Reads the current customer session and updates communication preferences. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { readCustomerSession, updateCustomerMarketingPreference } from "@/server/customers/customer-account-service";
import { customerSessionCookieName, isCustomerAuthDevelopmentPreview, isTrustedCustomerMutationOrigin } from "@/server/customers/customer-security";

const preferenceSchema = z.object({ marketingEmailConsent: z.boolean() }).strict();

export async function GET(request: Request) {
  const account = await readCustomerSession(readCookie(request.headers.get("cookie"), customerSessionCookieName));
  return noStoreJson({ ok: true, account, developmentPreview: isCustomerAuthDevelopmentPreview() });
}

export async function PATCH(request: Request) {
  if (!isTrustedCustomerMutationOrigin(request)) return noStoreJson({ ok: false, error: "This request could not be verified." }, 403);
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ ok: false, error: "Choose a valid email preference." }, 400);
  const account = await updateCustomerMarketingPreference(
    readCookie(request.headers.get("cookie"), customerSessionCookieName),
    parsed.data.marketingEmailConsent
  );
  if (!account) return noStoreJson({ ok: false, error: "Your session has expired. Sign in again." }, 401);
  return noStoreJson({ ok: true, account });
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
