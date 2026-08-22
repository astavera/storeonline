/**
 * Coordinates AdminUser persistence with the external Operations access API.
 * Authorization is intentionally performed by the calling API boundary.
 */

import "server-only";

import { z } from "zod";
import { recordAdminAuditEvent, type AdminAuditEvent } from "@/server/admin/admin-audit-service";
import {
  createPrismaOperationsAccessRepository,
  type LocalOperationsAccessStatus,
  type OperationsAccessAdminUser,
  type OperationsAccessCompletion,
  type OperationsAccessRepository
} from "@/server/admin/identity/operations-access-repository";
import {
  operationsAccessRoleSchema,
  type OperationsAccessFailureCode,
  type OperationsAccessSyncResult
} from "@/server/operations-access/contracts";
import {
  getOperationsAccessRuntime,
  type OperationsAccessRuntime
} from "@/server/operations-access/runtime";

const safeIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/);
const idempotencyKeySchema = z.string().trim().min(16).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/);
const correlationIdSchema = z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/);

const assignmentSchema = z.object({
  actorId: safeIdSchema,
  adminUserId: safeIdSchema,
  role: operationsAccessRoleSchema,
  locationIds: z.array(safeIdSchema).min(1).max(100),
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema.optional()
}).strict();

const revocationSchema = z.object({
  actorId: safeIdSchema,
  adminUserId: safeIdSchema,
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema.optional(),
  reason: z.string().trim().min(1).max(240).optional()
}).strict();

export type AssignAdminOperationsAccessInput = z.infer<typeof assignmentSchema>;
export type RevokeAdminOperationsAccessInput = z.infer<typeof revocationSchema>;

export type AdminOperationsAccessOutcome =
  | "pending"
  | "active"
  | "sync_failed"
  | "revocation_pending"
  | "revoked"
  | "unavailable"
  | "already_revoked"
  | "superseded";

export type AdminOperationsAccessResult = {
  adminUserId: string;
  status: LocalOperationsAccessStatus;
  outcome: AdminOperationsAccessOutcome;
  applied: boolean;
  failureCode?: OperationsAccessFailureCode | "OPERATIONS_ACCESS_UNAVAILABLE" | "OPERATIONS_ACCESS_CONFIGURATION_INVALID";
  correlationId?: string;
};

type ServiceDependencies = {
  repository: OperationsAccessRepository;
  resolveRuntime: () => OperationsAccessRuntime;
  audit?: (event: AdminAuditEvent) => Promise<unknown>;
  now?: () => Date;
};

export function mapAdapterStatusToLocalStatus(
  status: OperationsAccessSyncResult["status"]
): LocalOperationsAccessStatus {
  switch (status) {
    case "pending":
      return "PENDING";
    case "active":
      return "ACTIVE";
    case "sync_failed":
      return "FAILED";
    case "revocation_pending":
      return "REVOKING";
    case "revoked":
      return "NONE";
  }
}

function sameLocations(left: readonly string[], right: readonly string[]) {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function unavailableCode(runtime: Extract<OperationsAccessRuntime, { ready: false }>) {
  return runtime.reason === "INVALID_CONFIGURATION"
    ? "OPERATIONS_ACCESS_CONFIGURATION_INVALID" as const
    : "OPERATIONS_ACCESS_UNAVAILABLE" as const;
}

function safeDisplayName(user: OperationsAccessAdminUser) {
  return (user.displayName?.trim() || user.email).slice(0, 160);
}

export function createAdminOperationsAccessService({
  repository,
  resolveRuntime,
  audit = recordAdminAuditEvent,
  now = () => new Date()
}: ServiceDependencies) {
  async function bestEffortAudit(event: AdminAuditEvent) {
    try {
      await audit(event);
    } catch {
      // Audit persistence is best-effort at this layer and never changes access state.
    }
  }

  async function resultAfterConditionalCompletion(input: {
    userId: string;
    revision: string;
    expectedStatus: "PENDING" | "REVOKING";
    completion: OperationsAccessCompletion;
    outcome: AdminOperationsAccessOutcome;
    failureCode?: AdminOperationsAccessResult["failureCode"];
    correlationId?: string;
  }): Promise<AdminOperationsAccessResult> {
    const applied = await repository.completeRequest({
      adminUserId: input.userId,
      expectedRevision: input.revision,
      expectedStatus: input.expectedStatus,
      completion: input.completion
    });
    if (applied) {
      return {
        adminUserId: input.userId,
        status: input.completion.status,
        outcome: input.outcome,
        applied: true,
        ...(input.failureCode ? { failureCode: input.failureCode } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {})
      };
    }

    const current = await repository.findAdminUser(input.userId);
    if (!current) throw new AdminOperationsAccessServiceError("ADMIN_USER_NOT_FOUND");
    return {
      adminUserId: input.userId,
      status: current.operationsAccessStatus,
      outcome: "superseded",
      applied: false
    };
  }

  return {
    async assign(rawInput: AssignAdminOperationsAccessInput): Promise<AdminOperationsAccessResult> {
      const parsed = assignmentSchema.safeParse(rawInput);
      if (!parsed.success) throw new AdminOperationsAccessServiceError("INVALID_INPUT");
      const input = parsed.data;
      const locationIds = [...new Set(input.locationIds)].sort();
      const existing = await repository.findAdminUser(input.adminUserId);
      if (!existing) throw new AdminOperationsAccessServiceError("ADMIN_USER_NOT_FOUND");

      const runtime = resolveRuntime();
      const externalSubject = existing.operationsExternalSubject ?? existing.id;
      if (!runtime.ready) {
        const code = unavailableCode(runtime);
        const staged = await repository.stageAssignment({
          adminUserId: existing.id,
          role: input.role,
          locationIds,
          externalSubject,
          requestedAt: now(),
          status: "UNAVAILABLE",
          syncError: code
        });
        await bestEffortAudit({
          actorId: input.actorId,
          action: "operations_access.assign_unavailable",
          entityType: "AdminUser",
          entityId: existing.id,
          before: {
            role: existing.operationsRole,
            status: existing.operationsAccessStatus,
            locationIds: existing.locationIds
          },
          after: { role: input.role, status: "UNAVAILABLE", locationIds }
        });
        return {
          adminUserId: staged.user.id,
          status: "UNAVAILABLE",
          outcome: "unavailable",
          applied: true,
          failureCode: code
        };
      }

      const staged = await repository.stageAssignment({
        adminUserId: existing.id,
        role: input.role,
        locationIds,
        externalSubject,
        requestedAt: now(),
        status: "PENDING",
        syncError: null
      });
      if (staged.user.operationsRole !== input.role || !sameLocations(staged.user.locationIds, locationIds)) {
        throw new AdminOperationsAccessServiceError("LOCAL_ASSIGNMENT_MISMATCH");
      }

      let externalResult: OperationsAccessSyncResult;
      try {
        externalResult = await runtime.client.syncAccess({
          externalUserId: externalSubject,
          email: staged.user.email,
          displayName: safeDisplayName(staged.user),
          role: input.role,
          locationIds
        }, {
          idempotencyKey: input.idempotencyKey,
          ...(input.correlationId ? { correlationId: input.correlationId } : {})
        });
      } catch {
        externalResult = {
          status: "sync_failed",
          correlationId: input.correlationId ?? "operations-access-unavailable",
          failureCode: "UNAVAILABLE",
          retryable: true
        };
      }

      const isExpected = externalResult.status === "pending" ||
        externalResult.status === "active" ||
        externalResult.status === "sync_failed";
      const effectiveResult: OperationsAccessSyncResult = isExpected
        ? externalResult
        : {
            status: "sync_failed",
            correlationId: externalResult.correlationId,
            failureCode: "PROTOCOL_ERROR",
            retryable: false
          };
      const localStatus = mapAdapterStatusToLocalStatus(effectiveResult.status);
      const completed = await resultAfterConditionalCompletion({
        userId: existing.id,
        revision: staged.revision,
        expectedStatus: "PENDING",
        completion: {
          status: localStatus,
          syncError: effectiveResult.status === "sync_failed" ? effectiveResult.failureCode : null,
          ...(effectiveResult.status !== "sync_failed" ? { lastSyncedAt: now() } : {})
        },
        outcome: effectiveResult.status,
        ...(effectiveResult.status === "sync_failed" ? { failureCode: effectiveResult.failureCode } : {}),
        correlationId: effectiveResult.correlationId
      });

      await bestEffortAudit({
        actorId: input.actorId,
        action: "operations_access.assign",
        entityType: "AdminUser",
        entityId: existing.id,
        before: {
          role: existing.operationsRole,
          status: existing.operationsAccessStatus,
          locationIds: existing.locationIds
        },
        after: { role: input.role, status: completed.status, locationIds, outcome: completed.outcome }
      });
      return completed;
    },

    async revoke(rawInput: RevokeAdminOperationsAccessInput): Promise<AdminOperationsAccessResult> {
      const parsed = revocationSchema.safeParse(rawInput);
      if (!parsed.success) throw new AdminOperationsAccessServiceError("INVALID_INPUT");
      const input = parsed.data;
      const existing = await repository.findAdminUser(input.adminUserId);
      if (!existing) throw new AdminOperationsAccessServiceError("ADMIN_USER_NOT_FOUND");

      if (existing.operationsAccessStatus === "NONE" && !existing.operationsExternalSubject) {
        return {
          adminUserId: existing.id,
          status: "NONE",
          outcome: "already_revoked",
          applied: true
        };
      }

      const runtime = resolveRuntime();
      if (!runtime.ready) {
        const code = unavailableCode(runtime);
        await repository.stageRevocation({
          adminUserId: existing.id,
          requestedAt: now(),
          status: "UNAVAILABLE",
          syncError: code
        });
        await bestEffortAudit({
          actorId: input.actorId,
          action: "operations_access.revoke_unavailable",
          entityType: "AdminUser",
          entityId: existing.id,
          before: { role: existing.operationsRole, status: existing.operationsAccessStatus },
          after: { role: existing.operationsRole, status: "UNAVAILABLE" }
        });
        return {
          adminUserId: existing.id,
          status: "UNAVAILABLE",
          outcome: "unavailable",
          applied: true,
          failureCode: code
        };
      }

      const staged = await repository.stageRevocation({
        adminUserId: existing.id,
        requestedAt: now(),
        status: "REVOKING",
        syncError: null
      });
      const externalSubject = staged.user.operationsExternalSubject ?? staged.user.id;
      let externalResult: OperationsAccessSyncResult;
      try {
        externalResult = await runtime.client.revokeAccess({
          externalUserId: externalSubject,
          ...(input.reason ? { reason: input.reason } : {})
        }, {
          idempotencyKey: input.idempotencyKey,
          ...(input.correlationId ? { correlationId: input.correlationId } : {})
        });
      } catch {
        externalResult = {
          status: "sync_failed",
          correlationId: input.correlationId ?? "operations-access-unavailable",
          failureCode: "UNAVAILABLE",
          retryable: true
        };
      }

      const isExpected = externalResult.status === "revocation_pending" ||
        externalResult.status === "revoked" ||
        externalResult.status === "sync_failed";
      const effectiveResult: OperationsAccessSyncResult = isExpected
        ? externalResult
        : {
            status: "sync_failed",
            correlationId: externalResult.correlationId,
            failureCode: "PROTOCOL_ERROR",
            retryable: false
          };
      const localStatus = mapAdapterStatusToLocalStatus(effectiveResult.status);
      const completed = await resultAfterConditionalCompletion({
        userId: existing.id,
        revision: staged.revision,
        expectedStatus: "REVOKING",
        completion: {
          status: localStatus,
          syncError: effectiveResult.status === "sync_failed" ? effectiveResult.failureCode : null,
          ...(effectiveResult.status !== "sync_failed" ? { lastSyncedAt: now() } : {}),
          ...(effectiveResult.status === "revoked" ? { clearAssignment: true } : {})
        },
        outcome: effectiveResult.status,
        ...(effectiveResult.status === "sync_failed" ? { failureCode: effectiveResult.failureCode } : {}),
        correlationId: effectiveResult.correlationId
      });

      await bestEffortAudit({
        actorId: input.actorId,
        action: "operations_access.revoke",
        entityType: "AdminUser",
        entityId: existing.id,
        before: { role: existing.operationsRole, status: existing.operationsAccessStatus },
        after: { role: completed.status === "NONE" ? null : existing.operationsRole, status: completed.status, outcome: completed.outcome }
      });
      return completed;
    }
  };
}

export function getAdminOperationsAccessService() {
  return createAdminOperationsAccessService({
    repository: createPrismaOperationsAccessRepository(),
    resolveRuntime: getOperationsAccessRuntime
  });
}

export class AdminOperationsAccessServiceError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "ADMIN_USER_NOT_FOUND" | "LOCAL_ASSIGNMENT_MISMATCH") {
    super("The Operations access request could not be completed.");
    this.name = "AdminOperationsAccessServiceError";
  }
}
