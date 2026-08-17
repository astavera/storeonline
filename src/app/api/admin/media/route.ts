/**
 * Handles HTTP requests for the API admin media endpoint.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { adminMediaUploadMaxBytes, buildAdminMediaUploadMetadata, validateAdminImageContent } from "@/server/admin/admin-media-service";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.mediaWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > adminMediaUploadMaxBytes + 128 * 1024) {
    return NextResponse.json({ ok: false, errors: ["Upload must be 5 MB or smaller."] }, { status: 413 });
  }

  let rateLimit;
  try {
    rateLimit = await getAdminRateLimiter().consume({
      key: authorization.session.subject,
      scope: "admin-media-upload",
      limit: 10,
      windowMs: 60_000
    });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, errors: [error.message] }, { status: 503 });
    }
    throw error;
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, errors: ["Too many upload attempts. Try again later."] },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadFile(file)) {
      return NextResponse.json(
        {
          ok: false,
          errors: ["Image file is required."]
        },
        { status: 400 }
      );
    }

    const metadata = buildAdminMediaUploadMetadata({
      name: file.name,
      size: file.size,
      type: file.type
    });

    if (!metadata.ok) {
      return NextResponse.json(metadata, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentErrors = validateAdminImageContent(bytes, file.type);
    if (contentErrors.length > 0) {
      return NextResponse.json({ ok: false, errors: contentErrors }, { status: 400 });
    }

    const uploadDir = path.resolve(process.cwd(), "public", "uploads", "admin");
    const uploadPath = path.resolve(uploadDir, metadata.asset.fileName);
    if (path.dirname(uploadPath) !== uploadDir) {
      return NextResponse.json({ ok: false, errors: ["Unsafe upload path rejected."] }, { status: 400 });
    }

    await mkdir(uploadDir, { recursive: true });
    await writeFile(uploadPath, bytes, { flag: "wx" });

    return NextResponse.json({
      ok: true,
      asset: metadata.asset,
      storage: {
        mode: "public-folder",
        persisted: true,
        message: "Uploaded to public uploads."
      },
      errors: []
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Image upload failed."]
      },
      { status: 400 }
    );
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "size" in value && "type" in value;
}
