/** Revokes the current customer account session. */

import { NextResponse } from "next/server";
import { revokeCustomerSession } from "@/server/customers/customer-account-service";
import { customerSessionCookieName, isTrustedCustomerMutationOrigin } from "@/server/customers/customer-security";

export async function POST(request: Request) {
  if (!isTrustedCustomerMutationOrigin(request)) return noStoreJson({ ok: false, error: "This request could not be verified." }, 403);
  await revokeCustomerSession(readCookie(request.headers.get("cookie"), customerSessionCookieName));
  const response = noStoreJson({ ok: true });
  response.cookies.set(customerSessionCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
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
