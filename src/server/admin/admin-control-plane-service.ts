/**
 * Implements server-side admin control plane service behavior and persistence boundaries.
 */

import "server-only";

import { adminModules, getAdminModuleById, type AdminFieldValue, type AdminModule, type AdminWorkflowAction } from "@/config/admin-control-plane";
import { buildAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { writeLocalCmsVersion } from "@/server/admin/admin-local-cms-store";
import { createDatabaseCmsVersion } from "@/server/db/cms-version-repository";
import { isDevelopmentLocalPersistenceEnabled, PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";

export type AdminControlPayload = {
  moduleId: string;
  operation: AdminWorkflowAction;
  values: Record<string, unknown>;
  actorId?: string;
  entityId?: string;
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
  const moduleConfig = getAdminModuleById(payload.moduleId);

  if (!moduleConfig) {
    return { ok: false, errors: [`Unknown admin module: ${payload.moduleId}`] };
  }

  if (!moduleConfig.workflowActions.includes(payload.operation)) {
    return { ok: false, module: moduleSummary(moduleConfig), errors: [`Operation ${payload.operation} is not allowed for ${moduleConfig.title}.`] };
  }

  const { errors, sanitizedValues } = sanitizeAdminValues(moduleConfig, payload.values);

  if (errors.length > 0) {
    return { ok: false, module: moduleSummary(moduleConfig), operation: payload.operation, errors };
  }

  const status = actionToStatus[payload.operation];
  const actorId = payload.actorId || "local-admin";
  const entityId = resolveAdminEntityId(moduleConfig, payload.entityId);
  const payloadWithMeta = {
    ...sanitizedValues,
    workflow: {
      status,
      riskLevel: moduleConfig.riskLevel,
      sectionId: moduleConfig.sectionId,
      operation: payload.operation,
      submittedAt: new Date().toISOString()
    }
  };

  return {
    ok: true,
    module: moduleSummary(moduleConfig),
    operation: payload.operation,
    status,
    version: {
      entityType: "ADMIN_MODULE",
      entityId,
      versionNumber: Date.now(),
      payload: payloadWithMeta
    },
    auditEvent: buildAdminAuditEvent({
      actorId,
      action: `admin.${payload.operation}`,
      entityType: "ADMIN_MODULE",
      entityId
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

  let persistence: ReturnType<typeof requireDatabaseOrDevelopmentFallback>;
  try {
    persistence = requireDatabaseOrDevelopmentFallback("Admin CMS");
  } catch (error) {
    const persistenceError = error instanceof PersistenceUnavailableError
      ? error
      : new PersistenceUnavailableError("Admin CMS", { cause: error });
    return {
      mode: "validated-only",
      persisted: false,
      message: persistenceError.message
    };
  }

  if (persistence === "database") {
    try {
      const created = await createDatabaseCmsVersion({
        entityType: result.version.entityType,
        entityId: result.version.entityId,
        status: result.status,
        title: versionTitle(result),
        payload: result.version.payload,
        publishedAt: result.status === "PUBLISHED" ? new Date() : null
      });
      return {
        mode: "database",
        persisted: true,
        id: created.id,
        versionNumber: created.versionNumber,
        message: `Saved version ${created.versionNumber} to CmsContentVersion.`
      };
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) {
        const persistenceError = error instanceof PersistenceUnavailableError ? error : new PersistenceUnavailableError("Admin CMS", { cause: error });
        return {
          mode: "validated-only",
          persisted: false,
          message: persistenceError.message
        };
      }
      console.warn("[development-local-persistence] Admin CMS database write failed; using the explicit local fallback.");
    }
  }

  const localVersion = await writeLocalCmsVersion({
    entityType: result.version.entityType,
    entityId: result.version.entityId,
    status: result.status,
    title: versionTitle(result),
    payload: result.version.payload
  });

  return {
    mode: "local-file",
    persisted: true,
    id: `${localVersion.entityId}:${localVersion.versionNumber}`,
    versionNumber: localVersion.versionNumber,
    message: `Saved explicit development-local version ${localVersion.versionNumber}.`
  };
}

function resolveAdminEntityId(module: AdminModule, requestedEntityId?: string) {
  if (module.id !== "homepage" || !requestedEntityId) {
    return module.id;
  }

  const normalized = requestedEntityId.trim().toLowerCase();

  if (normalized === "homepage") {
    return normalized;
  }

  if (/^homepage:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return normalized;
  }

  throw new TypeError("Homepage document ID is invalid.");
}

function versionTitle(result: AdminControlResult) {
  const homepageName = result.version?.payload.homepageName;

  return typeof homepageName === "string" && homepageName.trim()
    ? homepageName.trim()
    : result.module?.title ?? "CMS update";
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
