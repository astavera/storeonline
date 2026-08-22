/**
 * Defines the proposed server-to-server access-assignment contract with
 * operation.modernstate.com. The external service remains authoritative for
 * whether an Operations access grant is actually active.
 */

import "server-only";

import { z } from "zod";

export const operationsAccessRoles = [
  "OPERATIONS_MANAGER",
  "STORE_STAFF",
  "FULFILLMENT",
  "DELIVERY",
  "WAREHOUSE"
] as const;

export const operationsAccessSyncStatuses = [
  "pending",
  "active",
  "sync_failed",
  "revocation_pending",
  "revoked"
] as const;

export const operationsAccessRoleSchema = z.enum(operationsAccessRoles);
export const operationsAccessSyncStatusSchema = z.enum(operationsAccessSyncStatuses);

const stableIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/);
const locationIdSchema = stableIdSchema;

export const operationsAccessAssignmentInputSchema = z.object({
  externalUserId: stableIdSchema,
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(160),
  role: operationsAccessRoleSchema,
  locationIds: z.array(locationIdSchema).min(1).max(100)
}).strict();

export const operationsAccessRevocationInputSchema = z.object({
  externalUserId: stableIdSchema,
  reason: z.string().trim().min(1).max(240).optional()
}).strict();

export const operationsAccessRequestOptionsSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/),
  correlationId: z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/).optional()
}).strict();

const responseBaseSchema = z.object({
  ok: z.literal(true),
  correlationId: z.string().min(8).max(160),
  operationId: z.string().min(1).max(200),
  replayed: z.boolean()
});

const assignmentEchoSchema = z.object({
  externalUserId: stableIdSchema,
  role: operationsAccessRoleSchema,
  locationIds: z.array(locationIdSchema).min(1).max(100)
}).strict();

export const operationsAccessUpsertResponseSchema = z.discriminatedUnion("state", [
  responseBaseSchema.extend({
    state: z.literal("PENDING"),
    confirmedAt: z.null(),
    assignment: assignmentEchoSchema
  }).strict(),
  responseBaseSchema.extend({
    state: z.literal("ACTIVE"),
    confirmedAt: z.string().datetime(),
    assignment: assignmentEchoSchema
  }).strict()
]);

export const operationsAccessRevokeResponseSchema = z.discriminatedUnion("state", [
  responseBaseSchema.extend({
    state: z.literal("REVOCATION_PENDING"),
    confirmedAt: z.null(),
    externalUserId: stableIdSchema
  }).strict(),
  responseBaseSchema.extend({
    state: z.literal("REVOKED"),
    confirmedAt: z.string().datetime(),
    externalUserId: stableIdSchema
  }).strict()
]);

export type OperationsAccessRole = z.infer<typeof operationsAccessRoleSchema>;
export type OperationsAccessSyncStatus = z.infer<typeof operationsAccessSyncStatusSchema>;
export type OperationsAccessAssignmentInput = z.infer<typeof operationsAccessAssignmentInputSchema>;
export type OperationsAccessRevocationInput = z.infer<typeof operationsAccessRevocationInputSchema>;
export type OperationsAccessRequestOptions = z.infer<typeof operationsAccessRequestOptionsSchema>;

export type OperationsAccessFailureCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_FAILED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "EXTERNAL_REJECTED"
  | "PROTOCOL_ERROR"
  | "REQUEST_TIMEOUT"
  | "UNAVAILABLE";

export type OperationsAccessSyncResult =
  | {
      status: "pending" | "active" | "revocation_pending" | "revoked";
      correlationId: string;
      operationId: string;
      replayed: boolean;
      confirmedAt: string | null;
    }
  | {
      status: "sync_failed";
      correlationId: string;
      failureCode: OperationsAccessFailureCode;
      retryable: boolean;
    };

export type OperationsAccessClient = {
  syncAccess(
    input: OperationsAccessAssignmentInput,
    options: OperationsAccessRequestOptions
  ): Promise<OperationsAccessSyncResult>;
  revokeAccess(
    input: OperationsAccessRevocationInput,
    options: OperationsAccessRequestOptions
  ): Promise<OperationsAccessSyncResult>;
};
