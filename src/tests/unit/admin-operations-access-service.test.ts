// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  createAdminOperationsAccessService,
  mapAdapterStatusToLocalStatus
} from "@/server/admin/identity/operations-access-service";
import type {
  OperationsAccessAdminUser,
  OperationsAccessRepository
} from "@/server/admin/identity/operations-access-repository";
import type { OperationsAccessClient } from "@/server/operations-access/contracts";

const baseUser: OperationsAccessAdminUser = {
  id: "admin-user-1",
  email: "operator@example.com",
  displayName: "Store Operator",
  operationsRole: null,
  operationsAccessStatus: "NONE",
  operationsExternalSubject: null,
  locationIds: []
};

const assignmentInput = {
  actorId: "owner-1",
  adminUserId: "admin-user-1",
  role: "STORE_STAFF" as const,
  locationIds: ["location-b", "location-a", "location-a"],
  idempotencyKey: "operations-access:admin-user-1:revision-1",
  correlationId: "operations-correlation-1"
};

function createRepository(initial: OperationsAccessAdminUser = baseUser) {
  let user = { ...initial, locationIds: [...initial.locationIds] };
  let revision = 0;
  const repository: OperationsAccessRepository = {
    findAdminUser: vi.fn(async () => ({ ...user, locationIds: [...user.locationIds] })),
    stageAssignment: vi.fn(async (input) => {
      revision += 1;
      user = {
        ...user,
        operationsRole: input.role,
        operationsAccessStatus: input.status,
        operationsExternalSubject: input.externalSubject,
        locationIds: [...input.locationIds]
      };
      return { revision: String(revision), user: { ...user, locationIds: [...user.locationIds] } };
    }),
    stageRevocation: vi.fn(async (input) => {
      revision += 1;
      user = { ...user, operationsAccessStatus: input.status };
      return { revision: String(revision), user: { ...user, locationIds: [...user.locationIds] } };
    }),
    completeRequest: vi.fn(async (input) => {
      if (input.expectedRevision !== String(revision) || user.operationsAccessStatus !== input.expectedStatus) return false;
      user = {
        ...user,
        operationsAccessStatus: input.completion.status,
        ...(input.completion.clearAssignment
          ? { operationsRole: null, operationsExternalSubject: null }
          : {})
      };
      revision += 1;
      return true;
    })
  };
  return { repository, current: () => user };
}

function readyRuntime(client: OperationsAccessClient) {
  return { ready: true as const, mode: "api_v1" as const, client };
}

const noopAudit = async () => true;

function clientWith(overrides: Partial<OperationsAccessClient> = {}): OperationsAccessClient {
  return {
    syncAccess: vi.fn(async () => ({
      status: "pending" as const,
      correlationId: "operations-correlation-1",
      operationId: "operation-1",
      replayed: false,
      confirmedAt: null
    })),
    revokeAccess: vi.fn(async () => ({
      status: "revocation_pending" as const,
      correlationId: "operations-correlation-1",
      operationId: "operation-2",
      replayed: false,
      confirmedAt: null
    })),
    ...overrides
  };
}

describe("Admin Operations access service", () => {
  it("maps every adapter state to the uppercase local enum", () => {
    expect(mapAdapterStatusToLocalStatus("pending")).toBe("PENDING");
    expect(mapAdapterStatusToLocalStatus("active")).toBe("ACTIVE");
    expect(mapAdapterStatusToLocalStatus("sync_failed")).toBe("FAILED");
    expect(mapAdapterStatusToLocalStatus("revocation_pending")).toBe("REVOKING");
    expect(mapAdapterStatusToLocalStatus("revoked")).toBe("NONE");
  });

  it("persists UNAVAILABLE with a sanitized code and never calls an external client", async () => {
    const { repository, current } = createRepository();
    const audit = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    const service = createAdminOperationsAccessService({
      repository,
      resolveRuntime: () => ({ ready: false, mode: "unavailable", reason: "NOT_CONFIGURED" }),
      audit
    });

    await expect(service.assign(assignmentInput)).resolves.toEqual({
      adminUserId: "admin-user-1",
      status: "UNAVAILABLE",
      outcome: "unavailable",
      applied: true,
      failureCode: "OPERATIONS_ACCESS_UNAVAILABLE"
    });
    expect(current()).toMatchObject({
      operationsRole: "STORE_STAFF",
      operationsAccessStatus: "UNAVAILABLE",
      locationIds: ["location-a", "location-b"]
    });
    expect(repository.completeRequest).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("passes exact normalized role, locations and idempotency to Operations", async () => {
    const { repository, current } = createRepository();
    const externalClient = clientWith();
    const service = createAdminOperationsAccessService({
      repository,
      resolveRuntime: () => readyRuntime(externalClient),
      audit: noopAudit
    });

    await expect(service.assign(assignmentInput)).resolves.toMatchObject({
      status: "PENDING",
      outcome: "pending",
      applied: true
    });
    expect(externalClient.syncAccess).toHaveBeenCalledWith({
      externalUserId: "admin-user-1",
      email: "operator@example.com",
      displayName: "Store Operator",
      role: "STORE_STAFF",
      locationIds: ["location-a", "location-b"]
    }, {
      idempotencyKey: assignmentInput.idempotencyKey,
      correlationId: assignmentInput.correlationId
    });
    expect(current().operationsAccessStatus).toBe("PENDING");
  });

  it("marks ACTIVE only after the injected adapter returns confirmed active", async () => {
    const { repository, current } = createRepository();
    const externalClient = clientWith({
      syncAccess: vi.fn(async () => ({
        status: "active" as const,
        correlationId: "operations-correlation-1",
        operationId: "operation-confirmed",
        replayed: false,
        confirmedAt: "2026-08-19T18:00:00.000Z"
      }))
    });
    const service = createAdminOperationsAccessService({
      repository,
      resolveRuntime: () => readyRuntime(externalClient),
      audit: noopAudit
    });

    await expect(service.assign(assignmentInput)).resolves.toMatchObject({ status: "ACTIVE", outcome: "active" });
    expect(current().operationsAccessStatus).toBe("ACTIVE");
  });

  it("persists only a sanitized FAILED code after an adapter failure", async () => {
    const { repository, current } = createRepository();
    const externalClient = clientWith({
      syncAccess: vi.fn(async () => ({
        status: "sync_failed" as const,
        correlationId: "operations-correlation-1",
        failureCode: "AUTHENTICATION_FAILED" as const,
        retryable: false
      }))
    });
    const service = createAdminOperationsAccessService({
      repository,
      resolveRuntime: () => readyRuntime(externalClient),
      audit: noopAudit
    });

    await expect(service.assign(assignmentInput)).resolves.toMatchObject({
      status: "FAILED",
      outcome: "sync_failed",
      failureCode: "AUTHENTICATION_FAILED"
    });
    expect(current().operationsAccessStatus).toBe("FAILED");
    expect(repository.completeRequest).toHaveBeenCalledWith(expect.objectContaining({
      completion: expect.objectContaining({ syncError: "AUTHENTICATION_FAILED" })
    }));
  });

  it("keeps REVOKING until Operations confirms revocation, then clears the assignment", async () => {
    const activeUser: OperationsAccessAdminUser = {
      ...baseUser,
      operationsRole: "WAREHOUSE",
      operationsAccessStatus: "ACTIVE",
      operationsExternalSubject: "operations-subject-1",
      locationIds: ["location-a"]
    };
    const pendingState = createRepository(activeUser);
    const pendingService = createAdminOperationsAccessService({
      repository: pendingState.repository,
      resolveRuntime: () => readyRuntime(clientWith()),
      audit: noopAudit
    });
    await expect(pendingService.revoke({
      actorId: "owner-1",
      adminUserId: "admin-user-1",
      idempotencyKey: "operations-access:admin-user-1:revoke-1",
      correlationId: "operations-correlation-1"
    })).resolves.toMatchObject({ status: "REVOKING", outcome: "revocation_pending" });
    expect(pendingState.current()).toMatchObject({
      operationsRole: "WAREHOUSE",
      operationsAccessStatus: "REVOKING"
    });

    const confirmedState = createRepository(activeUser);
    const confirmedClient = clientWith({
      revokeAccess: vi.fn(async () => ({
        status: "revoked" as const,
        correlationId: "operations-correlation-1",
        operationId: "revoke-confirmed",
        replayed: false,
        confirmedAt: "2026-08-19T19:00:00.000Z"
      }))
    });
    const confirmedService = createAdminOperationsAccessService({
      repository: confirmedState.repository,
      resolveRuntime: () => readyRuntime(confirmedClient),
      audit: noopAudit
    });
    await expect(confirmedService.revoke({
      actorId: "owner-1",
      adminUserId: "admin-user-1",
      idempotencyKey: "operations-access:admin-user-1:revoke-2",
      correlationId: "operations-correlation-1"
    })).resolves.toMatchObject({ status: "NONE", outcome: "revoked" });
    expect(confirmedState.current()).toMatchObject({
      operationsRole: null,
      operationsAccessStatus: "NONE",
      operationsExternalSubject: null
    });
  });

  it("does not let a stale external response overwrite a newer local request", async () => {
    const { repository } = createRepository();
    vi.mocked(repository.completeRequest).mockResolvedValueOnce(false);
    vi.mocked(repository.findAdminUser)
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce({ ...baseUser, operationsRole: "DELIVERY", operationsAccessStatus: "PENDING" });
    const service = createAdminOperationsAccessService({
      repository,
      resolveRuntime: () => readyRuntime(clientWith({
        syncAccess: vi.fn(async () => ({
          status: "active" as const,
          correlationId: "operations-correlation-1",
          operationId: "stale-operation",
          replayed: false,
          confirmedAt: "2026-08-19T20:00:00.000Z"
        }))
      })),
      audit: noopAudit
    });

    await expect(service.assign(assignmentInput)).resolves.toEqual({
      adminUserId: "admin-user-1",
      status: "PENDING",
      outcome: "superseded",
      applied: false
    });
  });
});
