import { NextRequest, NextResponse } from "next/server";
import { adminModules } from "@/config/admin-control-plane";
import { buildAdminControlOperation, getAdminControlReadiness, persistAdminControlOperation } from "@/server/admin/admin-control-plane-service";

export async function GET() {
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
  try {
    const body = await request.json();
    const operation = buildAdminControlOperation({
      moduleId: String(body.moduleId ?? ""),
      operation: body.operation,
      values: body.values && typeof body.values === "object" ? body.values : {},
      actorId: request.headers.get("x-admin-actor") ?? undefined
    });

    if (!operation.ok) {
      return NextResponse.json(operation, { status: 400 });
    }

    const storage = await persistAdminControlOperation(operation);

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
