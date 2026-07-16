import { NextRequest, NextResponse } from "next/server";
import { adminModules } from "@/config/admin-control-plane";
import { buildAdminControlOperation, getAdminControlReadiness, persistAdminControlOperation } from "@/server/admin/admin-control-plane-service";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  return NextResponse.json({
    status: "operable",
    policy: "Admin mutations are validated through declared module fields. Production persistence uses CmsContentVersion when DATABASE_URL is configured.",
    readiness: getAdminControlReadiness(),
    modules: adminModules.map((module) => ({
      id: module.id,
      href: module.href,
      title: module.title,
      sectionId: module.sectionId,
      category: module.category,
      riskLevel: module.riskLevel,
      editableFieldCount: module.editableFields.length,
      workflowActions: module.workflowActions
    }))
  });
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.write);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const operation = buildAdminControlOperation({
      moduleId: String(body.moduleId ?? ""),
      operation: body.operation,
      values: body.values && typeof body.values === "object" ? body.values : {},
      actorId: authorization.session.subject
    });

    if (!operation.ok) {
      return NextResponse.json(operation, { status: 400 });
    }

    const storage = await persistAdminControlOperation(operation);

    if (!storage.persisted) {
      return NextResponse.json({ ok: false, errors: [storage.message], storage }, { status: 503 });
    }

    return NextResponse.json({
      ...operation,
      storage
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Invalid admin request."]
      },
      { status: 400 }
    );
  }
}
