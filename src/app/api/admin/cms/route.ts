import { NextRequest, NextResponse } from "next/server";
import { persistCmsDocument, type CmsDocumentOperation } from "@/server/admin/admin-cms-document-service";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

const allowedOperations = new Set<CmsDocumentOperation>(["save_draft", "preview", "publish"]);

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.write);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const operation = String(body.operation ?? "save_draft") as CmsDocumentOperation;

    if (!allowedOperations.has(operation)) {
      return NextResponse.json(
        {
          ok: false,
          errors: [`Unsupported CMS operation: ${operation}`]
        },
        { status: 400 }
      );
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
