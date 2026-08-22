/**
 * Implements the proposed Operations access-assignment API. Responses are
 * fail-closed: ACTIVE and REVOKED are emitted only after an exact, externally
 * confirmed response is validated.
 */

import "server-only";

import type { ZodType } from "zod";
import type { OperationsAccessApiConfiguration } from "@/server/operations-access/config";
import {
  operationsAccessAssignmentInputSchema,
  operationsAccessRequestOptionsSchema,
  operationsAccessRevokeResponseSchema,
  operationsAccessRevocationInputSchema,
  operationsAccessUpsertResponseSchema,
  type OperationsAccessClient,
  type OperationsAccessFailureCode,
  type OperationsAccessSyncResult
} from "@/server/operations-access/contracts";

const MAX_RESPONSE_BYTES = 64 * 1024;

type AdapterDependencies = {
  config: OperationsAccessApiConfiguration;
  fetchImpl?: typeof fetch;
  createCorrelationId?: () => string;
};

class SafeClientError extends Error {
  constructor(
    readonly code: OperationsAccessFailureCode,
    readonly retryable: boolean
  ) {
    super(code);
    this.name = "OperationsAccessClientError";
  }
}

function failure(
  correlationId: string,
  code: OperationsAccessFailureCode,
  retryable: boolean
): OperationsAccessSyncResult {
  return { status: "sync_failed", correlationId, failureCode: code, retryable };
}

function mapHttpFailure(status: number) {
  if (status === 401) return new SafeClientError("AUTHENTICATION_FAILED", false);
  if (status === 403) return new SafeClientError("FORBIDDEN", false);
  if (status === 409) return new SafeClientError("CONFLICT", false);
  if (status === 429) return new SafeClientError("RATE_LIMITED", true);
  if (status >= 500) return new SafeClientError("UNAVAILABLE", true);
  return new SafeClientError("EXTERNAL_REJECTED", false);
}

async function readLimitedJson(response: Response, signal: AbortSignal) {
  const contentType = response.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    throw new SafeClientError("PROTOCOL_ERROR", false);
  }

  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)
  ) {
    throw new SafeClientError("PROTOCOL_ERROR", false);
  }
  if (!response.body) throw new SafeClientError("PROTOCOL_ERROR", false);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const cancelOnAbort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancelOnAbort, { once: true });

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new SafeClientError("PROTOCOL_ERROR", false);
      }
      chunks.push(chunk.value);
    }
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new SafeClientError("PROTOCOL_ERROR", false);
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...new Set(left)].sort();
  const rightSorted = [...new Set(right)].sort();
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

export function createOperationsAccessHttpAdapter({
  config,
  fetchImpl = fetch,
  createCorrelationId = () => crypto.randomUUID()
}: AdapterDependencies): OperationsAccessClient {
  async function request(input: {
    path: "/api/v1/admin/access-assignments/sync" | "/api/v1/admin/access-assignments/revoke";
    body: unknown;
    idempotencyKey: string;
    correlationId: string;
    responseSchema: ZodType<unknown>;
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetchImpl(`${config.baseUrl}${input.path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.bearerToken}`,
          "content-type": "application/json",
          "idempotency-key": input.idempotencyKey,
          "x-correlation-id": input.correlationId,
          "x-operations-access-contract": config.contract
        },
        body: JSON.stringify(input.body),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });

      if (!response.ok) throw mapHttpFailure(response.status);
      if (response.headers.get("x-correlation-id") !== input.correlationId) {
        throw new SafeClientError("PROTOCOL_ERROR", false);
      }

      const raw = await readLimitedJson(response, controller.signal);
      const parsed = input.responseSchema.safeParse(raw);
      if (!parsed.success) throw new SafeClientError("PROTOCOL_ERROR", false);
      return { status: response.status, body: parsed.data };
    } catch (error) {
      if (error instanceof SafeClientError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new SafeClientError("REQUEST_TIMEOUT", true);
      }
      throw new SafeClientError("UNAVAILABLE", true);
    } finally {
      clearTimeout(timer);
    }
  }

  function correlation(value: string | undefined) {
    return value ?? createCorrelationId();
  }

  return {
    async syncAccess(rawInput, rawOptions) {
      const correlationId = correlation(rawOptions?.correlationId);
      const input = operationsAccessAssignmentInputSchema.safeParse(rawInput);
      const options = operationsAccessRequestOptionsSchema.safeParse({ ...rawOptions, correlationId });
      if (!input.success || !options.success) return failure(correlationId, "INVALID_INPUT", false);

      const locationIds = [...new Set(input.data.locationIds)].sort();
      try {
        const response = await request({
          path: "/api/v1/admin/access-assignments/sync",
          correlationId: options.data.correlationId!,
          idempotencyKey: options.data.idempotencyKey,
          body: {
            externalUserId: input.data.externalUserId,
            email: input.data.email,
            displayName: input.data.displayName,
            role: input.data.role,
            locationIds
          },
          responseSchema: operationsAccessUpsertResponseSchema
        });
        const body = response.body as ReturnType<typeof operationsAccessUpsertResponseSchema.parse>;

        if (
          body.correlationId !== options.data.correlationId ||
          body.assignment.externalUserId !== input.data.externalUserId ||
          body.assignment.role !== input.data.role ||
          !sameStringSet(body.assignment.locationIds, locationIds)
        ) {
          return failure(options.data.correlationId!, "PROTOCOL_ERROR", false);
        }
        if (body.state === "PENDING" && response.status === 202) {
          return {
            status: "pending",
            correlationId: body.correlationId,
            operationId: body.operationId,
            replayed: body.replayed,
            confirmedAt: null
          };
        }
        if (body.state === "ACTIVE" && response.status === 200 && body.confirmedAt) {
          return {
            status: "active",
            correlationId: body.correlationId,
            operationId: body.operationId,
            replayed: body.replayed,
            confirmedAt: body.confirmedAt
          };
        }
        return failure(options.data.correlationId!, "PROTOCOL_ERROR", false);
      } catch (error) {
        const safeError = error instanceof SafeClientError
          ? error
          : new SafeClientError("UNAVAILABLE", true);
        return failure(options.data.correlationId!, safeError.code, safeError.retryable);
      }
    },

    async revokeAccess(rawInput, rawOptions) {
      const correlationId = correlation(rawOptions?.correlationId);
      const input = operationsAccessRevocationInputSchema.safeParse(rawInput);
      const options = operationsAccessRequestOptionsSchema.safeParse({ ...rawOptions, correlationId });
      if (!input.success || !options.success) return failure(correlationId, "INVALID_INPUT", false);

      try {
        const response = await request({
          path: "/api/v1/admin/access-assignments/revoke",
          correlationId: options.data.correlationId!,
          idempotencyKey: options.data.idempotencyKey,
          body: input.data,
          responseSchema: operationsAccessRevokeResponseSchema
        });
        const body = response.body as ReturnType<typeof operationsAccessRevokeResponseSchema.parse>;

        if (
          body.correlationId !== options.data.correlationId ||
          body.externalUserId !== input.data.externalUserId
        ) {
          return failure(options.data.correlationId!, "PROTOCOL_ERROR", false);
        }
        if (body.state === "REVOCATION_PENDING" && response.status === 202) {
          return {
            status: "revocation_pending",
            correlationId: body.correlationId,
            operationId: body.operationId,
            replayed: body.replayed,
            confirmedAt: null
          };
        }
        if (body.state === "REVOKED" && response.status === 200 && body.confirmedAt) {
          return {
            status: "revoked",
            correlationId: body.correlationId,
            operationId: body.operationId,
            replayed: body.replayed,
            confirmedAt: body.confirmedAt
          };
        }
        return failure(options.data.correlationId!, "PROTOCOL_ERROR", false);
      } catch (error) {
        const safeError = error instanceof SafeClientError
          ? error
          : new SafeClientError("UNAVAILABLE", true);
        return failure(options.data.correlationId!, safeError.code, safeError.retryable);
      }
    }
  };
}
