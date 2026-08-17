/**
 * Verifies administrative sessions inside Server Components.
 */

import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeAdminReturnTo } from "@/lib/security/admin-return-to";
import {
  adminCapabilities,
  adminSessionCookieName,
  authorizeAdminRequest,
  type AdminCapability,
  type AdminSession
} from "@/server/admin/admin-security";

type RequireAdminSessionOptions = {
  capability?: AdminCapability;
  returnTo?: string;
};

export async function resolveAdminSessionRequest(
  request: Request,
  capability: AdminCapability = adminCapabilities.access
): Promise<AdminSession | null> {
  const authorization = await authorizeAdminRequest(request, capability);
  return authorization.ok ? authorization.session : null;
}

export function adminLoginRedirectPath(returnTo?: string) {
  const safeReturnTo = safeAdminReturnTo(returnTo);
  return `/admin/login?next=${encodeURIComponent(safeReturnTo)}`;
}

export async function requireAdminSession({
  capability = adminCapabilities.access,
  returnTo
}: RequireAdminSessionOptions = {}): Promise<AdminSession> {
  const session = await readAdminSession(capability);

  if (!session) {
    redirect(adminLoginRedirectPath(returnTo));
  }

  return session;
}

const readAdminSession = cache(async (capability: AdminCapability) => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const request = new Request("http://admin-session.internal/admin", {
    headers: createAuthorizationHeaders({
      host: requestHeaders.get("host"),
      token: cookieStore.get(adminSessionCookieName)?.value
    })
  });

  return resolveAdminSessionRequest(request, capability);
});

function createAuthorizationHeaders(input: { host: string | null; token: string | undefined }) {
  const authorizationHeaders = new Headers();
  if (input.host) authorizationHeaders.set("host", input.host);
  if (input.token) {
    authorizationHeaders.set(
      "cookie",
      `${adminSessionCookieName}=${encodeURIComponent(input.token)}`
    );
  }
  return authorizationHeaders;
}
