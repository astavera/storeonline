import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const adminSessionCookieName = "modern_state_admin";

export const adminCapabilities = {
  access: "admin:access",
  read: "admin:read",
  write: "admin:write",
  mediaWrite: "admin:media:write",
  merchandisingWrite: "admin:merchandising:write"
} as const;

export type AdminCapability = (typeof adminCapabilities)[keyof typeof adminCapabilities];

export type AdminSession = {
  subject: string;
  capabilities: string[];
  expiresAt: number;
};

type AdminSessionPayload = {
  sub: string;
  capabilities: string[];
  exp: number;
  aud: "modern-state-admin";
};

export type AdminAuthorizationResult =
  | { ok: true; session: AdminSession }
  | { ok: false; status: 401 | 403 | 429; code: string; message: string };

export async function authorizeAdminRequest(
  request: Request,
  capability: AdminCapability = adminCapabilities.access
): Promise<AdminAuthorizationResult> {
  const session = readDevelopmentSession(request) ?? verifyAdminSessionFromRequest(request);

  if (!session) {
    return { ok: false, status: 401, code: "ADMIN_SESSION_REQUIRED", message: "A valid administrative session is required." };
  }

  if (!hasCapability(session, capability)) {
    return { ok: false, status: 403, code: "ADMIN_CAPABILITY_REQUIRED", message: "The administrative session lacks the required capability." };
  }

  if (isMutableMethod(request.method) && !isTrustedMutationOrigin(request)) {
    return { ok: false, status: 403, code: "ADMIN_ORIGIN_REJECTED", message: "The request origin is not allowed for administrative mutations." };
  }

  return { ok: true, session };
}

export function adminAuthorizationResponse(result: Exclude<AdminAuthorizationResult, { ok: true }>) {
  return NextResponse.json(
    { ok: false, error: result.code, message: result.message, errors: [result.message] },
    { status: result.status, headers: { "Cache-Control": "private, no-store" } }
  );
}

export function createAdminSessionToken(input: {
  subject: string;
  capabilities: string[];
  expiresAt: number;
  secret: string;
}) {
  assertSecret(input.secret);
  const payload: AdminSessionPayload = {
    sub: input.subject,
    capabilities: Array.from(new Set(input.capabilities)),
    exp: input.expiresAt,
    aud: "modern-state-admin"
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, input.secret)}`;
}

export function verifyAdminSessionToken(token: string, secret: string, now = Date.now()): AdminSession | null {
  try {
    assertSecret(secret);
    const [encodedPayload, encodedSignature, extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra) return null;

    const expected = Buffer.from(sign(encodedPayload, secret), "utf8");
    const received = Buffer.from(encodedSignature, "utf8");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;
    if (
      payload.aud !== "modern-state-admin" ||
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      !Array.isArray(payload.capabilities) ||
      payload.capabilities.some((value) => typeof value !== "string") ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(now / 1000)
    ) {
      return null;
    }

    return { subject: payload.sub, capabilities: payload.capabilities, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function isTrustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.host !== host) return false;
  return allowedAdminOrigins().has(parsedOrigin.origin);
}

function verifyAdminSessionFromRequest(request: Request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const token = readCookie(request.headers.get("cookie"), adminSessionCookieName);
  return token ? verifyAdminSessionToken(token, secret) : null;
}

function readDevelopmentSession(request: Request): AdminSession | null {
  if (process.env.NODE_ENV !== "development" || process.env.ADMIN_DEV_BYPASS !== "true") return null;
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return null;
  return {
    subject: "local-development-admin",
    capabilities: ["admin:*"],
    expiresAt: Math.floor(Date.now() / 1000) + 300
  };
}

function hasCapability(session: AdminSession, capability: string) {
  return session.capabilities.includes("admin:*") || session.capabilities.includes(capability);
}

function allowedAdminOrigins() {
  const configured = [process.env.NEXT_PUBLIC_SITE_URL, ...(process.env.ADMIN_ALLOWED_ORIGINS ?? "").split(",")]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const origins = new Set<string>();
  for (const value of configured) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Invalid configuration is ignored so the guard remains fail-closed.
    }
  }
  if (process.env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return origins;
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function isMutableMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function assertSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 bytes.");
  }
}
