/**
 * Handles focused store administration reads and audited mutations.
 */

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getStorePolicyDefinition } from "@/config/store-administration.config";
import { persistCmsDocument } from "@/server/admin/admin-cms-document-service";
import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { persistAdminStoreLocation, readAdminStoreLocations } from "@/server/admin/store-location-admin-service";
import {
  persistStoreAdministrationSettings,
  readAdminStoreAdministrationSettings
} from "@/server/admin/store-administration-settings-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "store-settings:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const [settings, locations] = await Promise.all([
    readAdminStoreAdministrationSettings(),
    readAdminStoreLocations()
  ]);
  return NextResponse.json({ ok: true, settings, locations }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "store-settings:write");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const domain = String(body.domain ?? "");

    if (domain === "settings") {
      const operation = body.operation === "publish" ? "publish" : "save_draft";
      if (operation === "publish") {
        const denied = await enforcePublishRateLimit(authorization.session.subject, "settings");
        if (denied) return denied;
      }
      const result = await persistStoreAdministrationSettings({
        actorId: authorization.session.subject,
        operation,
        settings: body.settings
      });
      if (result.ok && operation === "publish") {
        revalidatePath("/", "layout");
        revalidatePath("/cart");
        revalidatePath("/checkout");
      }
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (domain === "location") {
      const result = await persistAdminStoreLocation({
        actorId: authorization.session.subject,
        location: body.location
      });
      if (result.ok) {
        revalidatePath("/", "layout");
        revalidatePath("/locations");
        revalidatePath("/cart");
        revalidatePath("/checkout");
      }
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (domain === "policy") {
      const operation = body.operation === "publish" ? "publish" : "save_draft";
      const policyId = String(body.document?.entityId ?? "");
      const definition = getStorePolicyDefinition(policyId);
      if (!definition || body.document?.entityType !== "policy") {
        return NextResponse.json({ ok: false, errors: ["A supported policy document is required."] }, { status: 400 });
      }
      if (operation === "publish") {
        const denied = await enforcePublishRateLimit(authorization.session.subject, `policy:${policyId}`);
        if (denied) return denied;
      }
      const result = await persistCmsDocument({ document: body.document, operation });
      if (result.ok) {
        await recordAdminAuditEvent({
          actorId: authorization.session.subject,
          action: operation === "publish" ? "STORE_POLICY_PUBLISHED" : "STORE_POLICY_DRAFT_SAVED",
          entityType: "CMS_policy",
          entityId: policyId,
          after: { title: body.document.title, route: definition.route, version: result.storage?.versionNumber }
        });
      }
      if (result.ok && operation === "publish") {
        revalidatePath(definition.route);
        revalidatePath("/", "layout");
      }
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    return NextResponse.json({ ok: false, errors: ["Unsupported store settings operation."] }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errors: [error instanceof Error ? error.message : "The store settings request could not be completed."]
    }, { status: 503 });
  }
}

async function enforcePublishRateLimit(subject: string, scope: string) {
  const rateLimit = await getAdminRateLimiter().consume({
    key: `${subject}:${scope}`,
    scope: "admin-store-settings-publish",
    limit: 4,
    windowMs: 60_000
  });
  if (rateLimit.allowed) return null;
  return NextResponse.json({
    ok: false,
    errors: [`Too many publish attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`]
  }, {
    status: 429,
    headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
  });
}
