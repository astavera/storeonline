import "server-only";

import { adminModules, getAdminModuleById, type AdminFieldValue, type AdminModule, type AdminWorkflowAction } from "@/config/admin-control-plane";
import { buildAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { writeLocalCmsVersion } from "@/server/admin/admin-local-cms-store";

export type AdminControlPayload = {
  moduleId: string;
  operation: AdminWorkflowAction;
  values: Record<string, unknown>;
  actorId?: string;
};

export type AdminControlResult = {
  ok: boolean;
  module?: Pick<AdminModule, "id" | "title" | "sectionId" | "riskLevel">;
  operation?: AdminWorkflowAction;
  status?: "DRAFT" | "PREVIEW" | "PUBLISHED" | "SCHEDULED" | "UNPUBLISHED";
  version?: {
    entityType: "ADMIN_MODULE";
    entityId: string;
    versionNumber: number;
    payload: Record<string, AdminFieldValue | Record<string, unknown>>;
  };
  auditEvent?: ReturnType<typeof buildAdminAuditEvent>;
  storage?: AdminStorageResult;
  errors: string[];
};

export type AdminStorageResult = {
  mode: "database" | "local-file" | "validated-only";
  persisted: boolean;
  message: string;
  id?: string;
  versionNumber?: number;
};

const actionToStatus: Record<AdminWorkflowAction, NonNullable<AdminControlResult["status"]>> = {
  save_draft: "DRAFT",
  preview: "PREVIEW",
  publish: "PUBLISHED",
  schedule: "SCHEDULED",
  unpublish: "UNPUBLISHED"
};

export function buildAdminControlOperation(payload: AdminControlPayload): AdminControlResult {
  const module = getAdminModuleById(payload.moduleId);

  if (!module) {
    return { ok: false, errors: [`Unknown admin module: ${payload.moduleId}`] };
  }

  if (!module.workflowActions.includes(payload.operation)) {
    return { ok: false, module: moduleSummary(module), errors: [`Operation ${payload.operation} is not allowed for ${module.title}.`] };
  }

  const { errors, sanitizedValues } = sanitizeAdminValues(module, payload.values);

  if (errors.length > 0) {
    return { ok: false, module: moduleSummary(module), operation: payload.operation, errors };
  }

  const status = actionToStatus[payload.operation];
  const actorId = payload.actorId || "local-admin";
  const payloadWithMeta = {
    ...sanitizedValues,
    workflow: {
      status,
      riskLevel: module.riskLevel,
      sectionId: module.sectionId,
      operation: payload.operation,
      submittedAt: new Date().toISOString()
    }
  };

  return {
    ok: true,
    module: moduleSummary(module),
    operation: payload.operation,
    status,
    version: {
      entityType: "ADMIN_MODULE",
      entityId: module.id,
      versionNumber: Date.now(),
      payload: payloadWithMeta
    },
    auditEvent: buildAdminAuditEvent({
      actorId,
      action: `admin.${payload.operation}`,
      entityType: "ADMIN_MODULE",
      entityId: module.id
    }),
    errors: []
  };
}

export function sanitizeAdminValues(module: AdminModule, values: Record<string, unknown>) {
  const errors: string[] = [];
  const sanitizedValues: Record<string, AdminFieldValue> = {};
  const fieldsByName = new Map(module.editableFields.map((field) => [field.name, field]));

  for (const key of Object.keys(values)) {
    if (!fieldsByName.has(key)) {
      errors.push(`${key} is not editable in ${module.title}.`);
    }
  }

  for (const field of module.editableFields) {
    const rawValue = values[field.name] ?? field.defaultValue ?? "";
    const isEmpty = rawValue === "" || rawValue === null || rawValue === undefined || (Array.isArray(rawValue) && rawValue.length === 0);

    if (field.required && isEmpty) {
      errors.push(`${field.label} is required.`);
      continue;
    }

    if (isEmpty && !field.required) {
      sanitizedValues[field.name] = Array.isArray(field.defaultValue) ? field.defaultValue : (field.defaultValue ?? "");
      continue;
    }

    try {
      sanitizedValues[field.name] = coerceFieldValue(field, rawValue);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${field.label} is invalid.`);
    }
  }

  return { errors, sanitizedValues };
}

export async function persistAdminControlOperation(result: AdminControlResult): Promise<AdminStorageResult> {
  if (!result.ok || !result.version || !result.status || !result.module) {
    return {
      mode: "validated-only",
      persisted: false,
      message: "Invalid admin operation was not persisted."
    };
  }

  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const cmsContentVersion = (prisma as any).cmsContentVersion;
      const latest = await cmsContentVersion.aggregate({
        where: {
          entityType: result.version.entityType,
          entityId: result.version.entityId
        },
        _max: {
          versionNumber: true
        }
      });
      const nextVersionNumber = (latest._max.versionNumber ?? 0) + 1;
      const created = await cmsContentVersion.create({
        data: {
          entityType: result.version.entityType,
          entityId: result.version.entityId,
          versionNumber: nextVersionNumber,
          status: result.status,
          title: result.module.title,
          payload: result.version.payload,
          publishedAt: result.status === "PUBLISHED" ? new Date() : null
        }
      });
      await prisma.$disconnect();

      return {
        mode: "database",
        persisted: true,
        id: created.id,
        versionNumber: nextVersionNumber,
        message: `Saved version ${nextVersionNumber} to CmsContentVersion.`
      };
    } catch (error) {
      try {
        const localVersion = await writeLocalCmsVersion({
          entityType: result.version.entityType,
          entityId: result.version.entityId,
          status: result.status,
          title: result.module.title,
          payload: result.version.payload
        });

        return {
          mode: "local-file",
          persisted: true,
          id: `${localVersion.entityId}:${localVersion.versionNumber}`,
          versionNumber: localVersion.versionNumber,
          message: `Database persistence failed (${error instanceof Error ? error.message : "unknown error"}). Saved local fallback version ${localVersion.versionNumber}.`
        };
      } catch (localError) {
        return {
          mode: "validated-only",
          persisted: false,
          message: `Validated but persistence failed. Database: ${error instanceof Error ? error.message : "unknown error"}. Local fallback: ${localError instanceof Error ? localError.message : "unknown error"}.`
        };
      }
    }
  }

  const localVersion = await writeLocalCmsVersion({
    entityType: result.version.entityType,
    entityId: result.version.entityId,
    status: result.status,
    title: result.module.title,
    payload: result.version.payload
  });

  return {
    mode: "local-file",
    persisted: true,
    id: `${localVersion.entityId}:${localVersion.versionNumber}`,
    versionNumber: localVersion.versionNumber,
    message: `Saved local version ${localVersion.versionNumber}. Configure DATABASE_URL in production for CmsContentVersion.`
  };
}

export function getAdminControlReadiness() {
  const totalModules = adminModules.length;
  const editableFieldCount = adminModules.reduce((count, module) => count + module.editableFields.length, 0);
  const criticalModules = adminModules.filter((module) => module.riskLevel === "critical").length;

  return {
    totalModules,
    editableFieldCount,
    criticalModules,
    productionStorage: Boolean(process.env.DATABASE_URL),
    requiredStorageModel: "CmsContentVersion"
  };
}

function moduleSummary(module: AdminModule) {
  return {
    id: module.id,
    title: module.title,
    sectionId: module.sectionId,
    riskLevel: module.riskLevel
  };
}

function coerceFieldValue(field: AdminModule["editableFields"][number], rawValue: unknown): AdminFieldValue {
  if (field.type === "boolean") {
    return rawValue === true || rawValue === "true" || rawValue === "on";
  }

  if (field.type === "number") {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`${field.label} must be a number.`);
    }
    return numericValue;
  }

  if (field.type === "list") {
    if (Array.isArray(rawValue)) {
      return rawValue.map((value) => String(value).trim()).filter(Boolean);
    }
    return String(rawValue)
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (field.type === "json") {
    if (typeof rawValue === "object" && rawValue !== null) {
      JSON.stringify(rawValue);
      return JSON.stringify(rawValue);
    }
    try {
      JSON.parse(String(rawValue));
      return String(rawValue);
    } catch {
      throw new Error(`${field.label} must be valid JSON.`);
    }
  }

  const textValue = String(rawValue).trim();

  if (field.type === "select" && field.options && !field.options.includes(textValue)) {
    throw new Error(`${field.label} must be one of: ${field.options.join(", ")}.`);
  }

  if (field.type === "url" && textValue && !textValue.startsWith("/") && !textValue.startsWith("https://")) {
    throw new Error(`${field.label} must be an internal path or HTTPS URL.`);
  }

  return textValue;
}
