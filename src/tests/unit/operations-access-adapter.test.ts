// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  OPERATIONS_ACCESS_API_ORIGIN,
  OPERATIONS_ACCESS_CONTRACT,
  parseOperationsAccessConfiguration
} from "@/server/operations-access/config";
import { createOperationsAccessHttpAdapter } from "@/server/operations-access/http-adapter";
import { createOperationsAccessRuntime } from "@/server/operations-access/runtime";
import { operationsAccessRoles } from "@/server/operations-access/contracts";

const bearerToken = "server-only-operations-access-token-123456789";
const correlationId = "corr-operations-access-0001";
const idempotencyKey = "operations-access:user-1:revision-1";
const configuredEnvironment = {
  OPERATIONS_ACCESS_SYNC_MODE: "API_V1",
  OPERATIONS_ACCESS_API_BASE_URL: OPERATIONS_ACCESS_API_ORIGIN,
  OPERATIONS_ACCESS_API_CONTRACT: OPERATIONS_ACCESS_CONTRACT,
  OPERATIONS_ACCESS_AUTH_MODE: "BEARER",
  OPERATIONS_ACCESS_API_TOKEN: bearerToken,
  OPERATIONS_ACCESS_TIMEOUT_MS: "5000"
};

const config = {
  baseUrl: OPERATIONS_ACCESS_API_ORIGIN,
  contract: OPERATIONS_ACCESS_CONTRACT,
  bearerToken,
  timeoutMs: 5_000
} as const;

const assignment = {
  externalUserId: "user-1",
  email: "operator@example.com",
  displayName: "Store Operator",
  role: "STORE_STAFF" as const,
  locationIds: ["location-b", "location-a", "location-a"]
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-correlation-id": correlationId
    }
  });
}

describe("Operations access configuration", () => {
  it("exposes exactly the five approved Operations roles", () => {
    expect(operationsAccessRoles).toEqual([
      "OPERATIONS_MANAGER",
      "STORE_STAFF",
      "FULFILLMENT",
      "DELIVERY",
      "WAREHOUSE"
    ]);
  });

  it("uses explicit unavailable mode until an external contract is configured", () => {
    expect(parseOperationsAccessConfiguration({})).toEqual({
      ready: false,
      mode: "unavailable",
      reason: "NOT_CONFIGURED"
    });
    expect(createOperationsAccessRuntime({ environment: {} })).toEqual({
      ready: false,
      mode: "unavailable",
      reason: "NOT_CONFIGURED"
    });
  });

  it("accepts only the canonical Operations origin and reports names, never secrets", () => {
    const ready = parseOperationsAccessConfiguration(configuredEnvironment);
    expect(ready).toMatchObject({ ready: true, mode: "api_v1" });

    const invalid = parseOperationsAccessConfiguration({
      ...configuredEnvironment,
      OPERATIONS_ACCESS_API_BASE_URL: "https://attacker.example.com",
      OPERATIONS_ACCESS_AUTH_MODE: "BASIC"
    });
    expect(invalid).toEqual({
      ready: false,
      mode: "unavailable",
      reason: "INVALID_CONFIGURATION",
      invalidVariables: ["OPERATIONS_ACCESS_API_BASE_URL", "OPERATIONS_ACCESS_AUTH_MODE"]
    });
    expect(JSON.stringify(invalid)).not.toContain(bearerToken);
  });
});

describe("Operations access HTTP adapter", () => {
  it("sends an idempotent server-side assignment and activates only an exact external confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      correlationId,
      operationId: "operation-1",
      replayed: false,
      state: "ACTIVE",
      confirmedAt: "2026-08-19T16:00:00.000Z",
      assignment: {
        externalUserId: "user-1",
        role: "STORE_STAFF",
        locationIds: ["location-a", "location-b"]
      }
    }, 200));
    const client = createOperationsAccessHttpAdapter({ config, fetchImpl: fetchMock as typeof fetch });

    await expect(client.syncAccess(assignment, { correlationId, idempotencyKey })).resolves.toEqual({
      status: "active",
      correlationId,
      operationId: "operation-1",
      replayed: false,
      confirmedAt: "2026-08-19T16:00:00.000Z"
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${OPERATIONS_ACCESS_API_ORIGIN}/api/v1/admin/access-assignments/sync`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${bearerToken}`,
      "idempotency-key": idempotencyKey,
      "x-correlation-id": correlationId,
      "x-operations-access-contract": OPERATIONS_ACCESS_CONTRACT
    });
    expect(JSON.parse(String(init.body))).toEqual({
      externalUserId: "user-1",
      email: "operator@example.com",
      displayName: "Store Operator",
      role: "STORE_STAFF",
      locationIds: ["location-a", "location-b"]
    });
    expect(String(init.body)).not.toContain(bearerToken);
  });

  it("keeps an accepted but unconfirmed assignment pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      correlationId,
      operationId: "operation-2",
      replayed: false,
      state: "PENDING",
      confirmedAt: null,
      assignment: {
        externalUserId: "user-1",
        role: "STORE_STAFF",
        locationIds: ["location-a", "location-b"]
      }
    }, 202));
    const client = createOperationsAccessHttpAdapter({ config, fetchImpl: fetchMock as typeof fetch });

    await expect(client.syncAccess(assignment, { correlationId, idempotencyKey })).resolves.toMatchObject({
      status: "pending",
      confirmedAt: null
    });
  });

  it("fails closed when Operations confirms a different role or uses an invalid status pairing", async () => {
    const mismatched = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      correlationId,
      operationId: "operation-3",
      replayed: false,
      state: "ACTIVE",
      confirmedAt: "2026-08-19T16:00:00.000Z",
      assignment: {
        externalUserId: "user-1",
        role: "DELIVERY",
        locationIds: ["location-a", "location-b"]
      }
    }, 200));
    const client = createOperationsAccessHttpAdapter({ config, fetchImpl: mismatched as typeof fetch });

    await expect(client.syncAccess(assignment, { correlationId, idempotencyKey })).resolves.toEqual({
      status: "sync_failed",
      correlationId,
      failureCode: "PROTOCOL_ERROR",
      retryable: false
    });

    const wrongStatus = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      correlationId,
      operationId: "operation-4",
      replayed: false,
      state: "ACTIVE",
      confirmedAt: "2026-08-19T16:00:00.000Z",
      assignment: {
        externalUserId: "user-1",
        role: "STORE_STAFF",
        locationIds: ["location-a", "location-b"]
      }
    }, 202));
    const wrongStatusClient = createOperationsAccessHttpAdapter({ config, fetchImpl: wrongStatus as typeof fetch });
    await expect(wrongStatusClient.syncAccess(assignment, { correlationId, idempotencyKey })).resolves.toMatchObject({
      status: "sync_failed",
      failureCode: "PROTOCOL_ERROR"
    });
  });

  it("represents revocation as pending until Operations confirms REVOKED", async () => {
    const pendingFetch = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      correlationId,
      operationId: "revoke-1",
      replayed: false,
      state: "REVOCATION_PENDING",
      confirmedAt: null,
      externalUserId: "user-1"
    }, 202));
    const pendingClient = createOperationsAccessHttpAdapter({ config, fetchImpl: pendingFetch as typeof fetch });
    await expect(pendingClient.revokeAccess(
      { externalUserId: "user-1", reason: "Access removed by owner" },
      { correlationId, idempotencyKey: "operations-access:user-1:revoke-1" }
    )).resolves.toMatchObject({ status: "revocation_pending", confirmedAt: null });

    const confirmedFetch = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      correlationId,
      operationId: "revoke-2",
      replayed: true,
      state: "REVOKED",
      confirmedAt: "2026-08-19T17:00:00.000Z",
      externalUserId: "user-1"
    }, 200));
    const confirmedClient = createOperationsAccessHttpAdapter({ config, fetchImpl: confirmedFetch as typeof fetch });
    await expect(confirmedClient.revokeAccess(
      { externalUserId: "user-1" },
      { correlationId, idempotencyKey: "operations-access:user-1:revoke-2" }
    )).resolves.toMatchObject({ status: "revoked", replayed: true });
  });

  it("returns a sanitized retryable failure on timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }));
      const client = createOperationsAccessHttpAdapter({
        config: { ...config, timeoutMs: 1_000 },
        fetchImpl: fetchMock as typeof fetch
      });
      const resultPromise = client.syncAccess(assignment, { correlationId, idempotencyKey });
      await vi.advanceTimersByTimeAsync(1_001);

      await expect(resultPromise).resolves.toEqual({
        status: "sync_failed",
        correlationId,
        failureCode: "REQUEST_TIMEOUT",
        retryable: true
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
