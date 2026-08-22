/** Prisma persistence boundary for an AdminUser's Operations access request. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";
import type { OperationsAccessRole } from "@/server/operations-access/contracts";

export type LocalOperationsAccessStatus =
  | "NONE"
  | "PENDING"
  | "ACTIVE"
  | "REVOKING"
  | "FAILED"
  | "UNAVAILABLE";

export type OperationsAccessAdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  operationsRole: OperationsAccessRole | null;
  operationsAccessStatus: LocalOperationsAccessStatus;
  operationsExternalSubject: string | null;
  locationIds: string[];
};

export type OperationsAccessRequestRevision = {
  revision: string;
  user: OperationsAccessAdminUser;
};

export type OperationsAccessCompletion = {
  status: LocalOperationsAccessStatus;
  syncError: string | null;
  lastSyncedAt?: Date;
  clearAssignment?: boolean;
};

export type OperationsAccessRepository = {
  findAdminUser(adminUserId: string): Promise<OperationsAccessAdminUser | null>;
  stageAssignment(input: {
    adminUserId: string;
    role: OperationsAccessRole;
    locationIds: string[];
    externalSubject: string;
    requestedAt: Date;
    status: "PENDING" | "UNAVAILABLE";
    syncError: string | null;
  }): Promise<OperationsAccessRequestRevision>;
  stageRevocation(input: {
    adminUserId: string;
    requestedAt: Date;
    status: "REVOKING" | "UNAVAILABLE";
    syncError: string | null;
  }): Promise<OperationsAccessRequestRevision>;
  completeRequest(input: {
    adminUserId: string;
    expectedRevision: string;
    expectedStatus: "PENDING" | "REVOKING";
    completion: OperationsAccessCompletion;
  }): Promise<boolean>;
};

type PrismaClient = ReturnType<typeof getPrismaClient>;

const adminUserSelection = {
  id: true,
  email: true,
  displayName: true,
  operationsRole: true,
  operationsLocationIds: true,
  operationsAccessStatus: true,
  operationsExternalSubject: true,
  updatedAt: true,
} as const;

function toAdminUser(record: {
  id: string;
  email: string;
  displayName: string | null;
  operationsRole: OperationsAccessRole | null;
  operationsLocationIds: string[];
  operationsAccessStatus: LocalOperationsAccessStatus;
  operationsExternalSubject: string | null;
}): OperationsAccessAdminUser {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    operationsRole: record.operationsRole,
    operationsAccessStatus: record.operationsAccessStatus,
    operationsExternalSubject: record.operationsExternalSubject,
    locationIds: [...record.operationsLocationIds].sort()
  };
}

export function createPrismaOperationsAccessRepository(
  prisma: PrismaClient = getPrismaClient()
): OperationsAccessRepository {
  return {
    async findAdminUser(adminUserId) {
      const record = await prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: adminUserSelection
      });
      return record ? toAdminUser(record) : null;
    },

    async stageAssignment(input) {
      const record = await prisma.$transaction(async (transaction) => {
        const locations = await transaction.storeLocation.findMany({
          where: { id: { in: input.locationIds } },
          select: { id: true }
        });
        if (locations.length !== input.locationIds.length) {
          throw new OperationsAccessRepositoryError("LOCATION_SCOPE_INVALID");
        }

        return transaction.adminUser.update({
          where: { id: input.adminUserId },
          data: {
            operationsRole: input.role,
            operationsLocationIds: input.locationIds,
            operationsAccessStatus: input.status,
            operationsExternalSubject: input.externalSubject,
            operationsRequestedAt: input.requestedAt,
            operationsSyncError: input.syncError
          },
          select: adminUserSelection
        });
      });

      return { revision: record.updatedAt.toISOString(), user: toAdminUser(record) };
    },

    async stageRevocation(input) {
      const record = await prisma.adminUser.update({
        where: { id: input.adminUserId },
        data: {
          operationsAccessStatus: input.status,
          operationsRequestedAt: input.requestedAt,
          operationsSyncError: input.syncError
        },
        select: adminUserSelection
      });
      return { revision: record.updatedAt.toISOString(), user: toAdminUser(record) };
    },

    async completeRequest(input) {
      const result = await prisma.adminUser.updateMany({
        where: {
          id: input.adminUserId,
          updatedAt: new Date(input.expectedRevision),
          operationsAccessStatus: input.expectedStatus
        },
        data: {
          operationsAccessStatus: input.completion.status,
          operationsSyncError: input.completion.syncError,
          ...(input.completion.lastSyncedAt
            ? { operationsLastSyncedAt: input.completion.lastSyncedAt }
            : {}),
          ...(input.completion.clearAssignment
            ? { operationsRole: null, operationsLocationIds: [], operationsExternalSubject: null }
            : {})
        }
      });
      return result.count === 1;
    }
  };
}

export class OperationsAccessRepositoryError extends Error {
  constructor(readonly code: "LOCATION_SCOPE_INVALID") {
    super("The Operations access request could not be persisted.");
    this.name = "OperationsAccessRepositoryError";
  }
}
