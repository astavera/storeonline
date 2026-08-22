/** Store Admin identity directory and owner-only account actions. */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { adminRoles } from "@/server/admin/identity";
import { operationsAccessRoles } from "@/server/operations-access/contracts";
import { AdminOperationsAccessServiceError, getAdminOperationsAccessService } from "@/server/admin/identity/operations-access-service";
import {
  AdminIdentityConflictError,
  AdminIdentityInputError,
  AdminIdentityNotFoundError,
  AdminIdentityUnavailableError,
  inviteAdminUser,
  readAdminIdentityDirectory,
  revokeAdminUserSessions,
  setAdminUserSuspended,
  updateAdminUserAccess
} from "@/server/admin/identity/admin-user-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const inviteSchema = z.object({
  action: z.literal("invite"),
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().max(160).optional(),
  role: z.enum(adminRoles),
  locationScopeMode: z.enum(["ALL", "LOCATIONS"]),
  locationIds: z.array(z.string().trim().min(1).max(160)).max(100).default([])
}).strict();

const accountActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), userId: z.string().trim().min(1).max(160) }).strict(),
  z.object({ action: z.literal("reactivate"), userId: z.string().trim().min(1).max(160) }).strict(),
  z.object({ action: z.literal("revoke_sessions"), userId: z.string().trim().min(1).max(160) }).strict(),
  z.object({ action: z.literal("assign_operations"), userId: z.string().trim().min(1).max(160), role: z.enum(operationsAccessRoles), locationIds: z.array(z.string().trim().min(1).max(160)).min(1).max(100) }).strict(),
  z.object({ action: z.literal("revoke_operations"), userId: z.string().trim().min(1).max(160) }).strict(),
  z.object({
    action: z.literal("update_admin_access"),
    userId: z.string().trim().min(1).max(160),
    role: z.enum(adminRoles),
    locationScopeMode: z.enum(["ALL", "LOCATIONS"]),
    locationIds: z.array(z.string().trim().min(1).max(160)).max(100)
  }).strict()
]);

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "users:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const directory = await readAdminIdentityDirectory();
  return NextResponse.json(
    { ok: directory.available, ...directory },
    { status: directory.available ? 200 : 503, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "users:invite");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);
  const roleAuthorization = await authorizeAdminRequest(request, "users:admin-role.assign");
  if (!roleAuthorization.ok) return adminAuthorizationResponse(roleAuthorization);

  const parsed = inviteSchema.safeParse(await safeJson(request));
  if (!parsed.success) return inputError("Enter a valid user, role, and location scope.");

  try {
    const invitation = await inviteAdminUser({ ...parsed.data, actorSubject: authorization.session.subject });
    return NextResponse.json(
      { ok: true, invitation },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return identityError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const parsed = accountActionSchema.safeParse(await safeJson(request));
  if (!parsed.success) return inputError("Select a supported account action.");
  const permission = parsed.data.action === "revoke_sessions"
    ? "users:sessions.revoke"
    : parsed.data.action === "assign_operations"
      ? "operations-access:assign"
      : parsed.data.action === "revoke_operations"
        ? "operations-access:revoke"
        : parsed.data.action === "update_admin_access"
          ? "users:admin-role.assign"
          : "users:suspend";
  const authorization = await authorizeAdminRequest(request, permission);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    if (parsed.data.action === "update_admin_access") {
      await updateAdminUserAccess({ ...parsed.data, actorSubject: authorization.session.subject });
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (parsed.data.action === "assign_operations" || parsed.data.action === "revoke_operations") {
      const service = getAdminOperationsAccessService();
      const idempotencyKey = `admin:${randomUUID()}`;
      const result = parsed.data.action === "assign_operations"
        ? await service.assign({
            actorId: authorization.session.subject,
            adminUserId: parsed.data.userId,
            role: parsed.data.role,
            locationIds: parsed.data.locationIds,
            idempotencyKey
          })
        : await service.revoke({
            actorId: authorization.session.subject,
            adminUserId: parsed.data.userId,
            idempotencyKey,
            reason: "Owner revoked access from Store Admin"
          });
      return NextResponse.json({ ok: true, operationsAccess: result }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (parsed.data.action === "revoke_sessions") {
      const revokedSessionCount = await revokeAdminUserSessions({
        userId: parsed.data.userId,
        actorSubject: authorization.session.subject
      });
      return NextResponse.json({ ok: true, revokedSessionCount }, { headers: { "Cache-Control": "private, no-store" } });
    }

    await setAdminUserSuspended({
      userId: parsed.data.userId,
      suspended: parsed.data.action === "suspend",
      actorSubject: authorization.session.subject
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return identityError(error);
  }
}

async function safeJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

function inputError(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
}

function identityError(error: unknown) {
  if (error instanceof AdminOperationsAccessServiceError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.code === "ADMIN_USER_NOT_FOUND" ? 404 : 400, headers: { "Cache-Control": "private, no-store" } });
  }
  if (error instanceof AdminIdentityInputError) return inputError(error.message);
  if (error instanceof AdminIdentityConflictError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
  if (error instanceof AdminIdentityNotFoundError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  if (error instanceof AdminIdentityUnavailableError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  console.warn("[admin-identity] User action failed.", error);
  return NextResponse.json(
    { ok: false, error: "The identity action could not be completed." },
    { status: 503, headers: { "Cache-Control": "private, no-store" } }
  );
}
