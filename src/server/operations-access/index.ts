/** Server-only public surface for Operations access synchronization. */

import "server-only";

export {
  operationsAccessRoles,
  operationsAccessSyncStatuses,
  type OperationsAccessAssignmentInput,
  type OperationsAccessClient,
  type OperationsAccessFailureCode,
  type OperationsAccessRevocationInput,
  type OperationsAccessRole,
  type OperationsAccessSyncResult,
  type OperationsAccessSyncStatus
} from "@/server/operations-access/contracts";
export { getOperationsAccessRuntime, type OperationsAccessRuntime } from "@/server/operations-access/runtime";
