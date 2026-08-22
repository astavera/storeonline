/**
 * Handles HTTP requests for the API admin CMS endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { cmsEntityTypes, type CmsEntityType } from "@/lib/cms";
import {
  listCmsDocumentVersions,
  persistCmsDocument,
  readCmsDocumentVersion,
  type CmsDocumentOperation
} from "@/server/admin/admin-cms-document-service";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { canDeleteStorefrontPage, deleteStorefrontPage } from "@/server/admin/storefront-page-deletion-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

const allowedOperations = new Set<CmsDocumentOperation>(["save_draft", "preview", "publish"]);

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "storefront:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const entityType = request.nextUrl.searchParams.get("entityType") ?? "";
    const entityId = request.nextUrl.searchParams.get("entityId") ?? "";
    if (!isCmsEntityType(entityType) || !entityId) {
      return NextResponse.json({ ok: false, errors: ["A valid CMS entity type and entity ID are required."] }, { status: 400 });
    }

    const versions = await listCmsDocumentVersions({ entityType, entityId });
    return NextResponse.json({ ok: true, versions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, errors: [error instanceof Error ? error.message : "Could not read CMS history."] },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "storefront:write");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const requestedOperation = String(body.operation ?? "save_draft");

    if (requestedOperation === "restore") {
      const entityType = String(body.entityType ?? "");
      const entityId = String(body.entityId ?? "");
      const versionNumber = Number(body.versionNumber);
      if (!isCmsEntityType(entityType) || !entityId || !Number.isInteger(versionNumber) || versionNumber < 1) {
        return NextResponse.json({ ok: false, errors: ["A valid CMS entity, page, and version are required."] }, { status: 400 });
      }

      const document = await readCmsDocumentVersion({ entityType, entityId, versionNumber });
      if (!document) {
        return NextResponse.json({ ok: false, errors: [`CMS version ${versionNumber} was not found.`] }, { status: 404 });
      }

      return NextResponse.json({ ok: true, document, restoredFromVersion: versionNumber });
    }

    const operation = requestedOperation as CmsDocumentOperation;

    if (!allowedOperations.has(operation)) {
      return NextResponse.json(
        {
          ok: false,
          errors: [`Unsupported CMS operation: ${operation}`]
        },
        { status: 400 }
      );
    }

    if (operation === "publish") {
      const rateLimit = await getAdminRateLimiter().consume({
        key: `${authorization.session.subject}:${String(body.document?.entityId ?? "unknown")}`,
        scope: "admin-cms-publish",
        limit: 3,
        windowMs: 60_000
      });

      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            ok: false,
            errors: [`Too many publish attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`],
            retryAfterSeconds: rateLimit.retryAfterSeconds
          },
          {
            status: 429,
            headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
          }
        );
      }
    }

    const result = await persistCmsDocument({
      operation,
      document: body.document
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Invalid CMS request."]
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "storefront:write");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const entityType = String(body.entityType ?? "");
    const entityId = String(body.entityId ?? "").trim();
    const title = String(body.title ?? entityId).trim();

    if (
      !isCmsEntityType(entityType) ||
      !entityId ||
      entityId.length > 180 ||
      !canDeleteStorefrontPage(entityType, entityId)
    ) {
      return NextResponse.json(
        { ok: false, errors: ["This core or operational page cannot be deleted."] },
        { status: 400 }
      );
    }

    const rateLimit = await getAdminRateLimiter().consume({
      key: `${authorization.session.subject}:${entityType}:${entityId}`,
      scope: "admin-cms-delete",
      limit: 3,
      windowMs: 5 * 60_000
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          errors: [`Too many delete attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`],
          retryAfterSeconds: rateLimit.retryAfterSeconds
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const result = await deleteStorefrontPage({ entityType, entityId, title });
    revalidatePath("/", "layout");
    revalidatePath("/admin/homepage");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Could not delete this page."]
      },
      { status: 503 }
    );
  }
}

function isCmsEntityType(value: string): value is CmsEntityType {
  return cmsEntityTypes.includes(value as CmsEntityType);
}
