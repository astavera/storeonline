/**
 * Shared security, session, rate-limit, and customer-safe error behavior for
 * public returns endpoints.
 */

import "server-only";

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { OrderProReturnsError } from "@/server/orderpro/returns-client";
import { ReturnRequestConflictError } from "@/server/returns/return-repository";
import { ReturnsSecurityError } from "@/server/returns/return-security";
import { ReturnsServiceError } from "@/server/returns/return-service";
import { ReturnLabelError } from "@/server/returns/shippo-return-label";

export const RETURNS_SESSION_COOKIE = "modern_state_returns";
export const returnNoStoreHeaders = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow"
} as const;

export async function consumeReturnRateLimit(input: {
  request: NextRequest;
  scope: string;
  identity?: string;
  limit: number;
  windowMs: number;
}) {
  const address = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || input.request.headers.get("x-real-ip")?.trim()
    || "unknown";
  const digest = createHash("sha256")
    .update(`${address}:${input.identity?.trim().toLowerCase() ?? ""}`)
    .digest("hex");
  return getAdminRateLimiter().consume({
    key: digest,
    scope: `returns:${input.scope}`,
    limit: input.limit,
    windowMs: input.windowMs
  });
}

export function assertReturnSameOrigin(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ReturnsServiceError("REQUEST_ORIGIN_REJECTED");
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : requestOrigin;
  if (origin !== requestOrigin && origin !== configuredOrigin) {
    throw new ReturnsServiceError("REQUEST_ORIGIN_REJECTED");
  }
}

export function readReturnsSessionToken(request: NextRequest) {
  const value = request.cookies.get(RETURNS_SESSION_COOKIE)?.value;
  if (!value) throw new ReturnsServiceError("SESSION_EXPIRED");
  return value;
}

export function returnsSessionCookieOptions(maxAgeSeconds = 30 * 60) {
  return {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/api/returns",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function returnJson(value: unknown, init?: ResponseInit) {
  return NextResponse.json(value, {
    ...init,
    headers: { ...returnNoStoreHeaders, ...init?.headers }
  });
}

export function returnApiError(error: unknown) {
  if (error instanceof ReturnsServiceError) {
    const status = error.code === "SESSION_EXPIRED"
      ? 401
      : error.code === "RETURN_NOT_FOUND"
        ? 404
        : error.code.includes("QUOTE")
          ? 409
          : error.code === "REQUEST_ORIGIN_REJECTED"
            ? 403
            : 422;
    return returnJson({ ok: false, code: error.code, message: error.message }, { status });
  }
  if (error instanceof ReturnsSecurityError) {
    return returnJson({
      ok: false,
      code: error.code,
      message: "Your secure return session expired. Please verify the order again."
    }, { status: 401 });
  }
  if (error instanceof ReturnRequestConflictError) {
    return returnJson({ ok: false, code: "IDEMPOTENCY_CONFLICT", message: error.message }, { status: 409 });
  }
  if (error instanceof ReturnLabelError) {
    return returnJson({
      ok: false,
      code: error.code,
      message: "The return label is temporarily unavailable. Please try again."
    }, { status: 503 });
  }
  if (error instanceof OrderProReturnsError) {
    return returnJson({
      ok: false,
      code: "RETURNS_TEMPORARILY_UNAVAILABLE",
      message: "The return portal is temporarily unavailable. Please try again."
    }, { status: 503 });
  }
  if (error instanceof PersistenceUnavailableError) {
    return returnJson({
      ok: false,
      code: error.code,
      message: "The return portal is temporarily unavailable. Please try again."
    }, { status: 503 });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return returnJson({
      ok: false,
      code: "INVALID_RETURN_REQUEST",
      message: "Check the return information and try again."
    }, { status: 400 });
  }
  console.error(JSON.stringify({
    event: "returns_api_failure",
    name: error instanceof Error ? error.name : "UnknownError"
  }));
  return returnJson({
    ok: false,
    code: "RETURNS_TEMPORARILY_UNAVAILABLE",
    message: "The return portal is temporarily unavailable. Please try again."
  }, { status: 503 });
}
