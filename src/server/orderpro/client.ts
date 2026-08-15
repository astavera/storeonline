/**
 * Implements server-side client behavior and persistence boundaries.
 */

import "server-only";

import type { ZodType } from "zod";
import type { OrderProTokenProvider } from "@/server/orderpro/auth0-token-provider";
import type { OrderProApiConfiguration } from "@/server/orderpro/config";
import {
  ORDERPRO_MAX_RESPONSE_BYTES,
  orderProAuthCheckFailureSchema,
  orderProAuthCheckSuccessSchema,
  orderProConfirmHoldRequestSchema,
  orderProCorrelationIdSchema,
  orderProCreateHoldRequestSchema,
  orderProCreateHoldResultSchema,
  orderProErrorResponseSchema,
  orderProGetHoldResultSchema,
  orderProHoldTransitionResultSchema,
  orderProIdempotencyKeySchema,
  orderProQuoteRequestSchema,
  orderProQuoteResultSchema,
  orderProReleaseHoldRequestSchema,
  orderProStableIdSchema,
  type OrderProAuthCheckFailure,
  type OrderProAuthCheckSuccess,
  type OrderProCreateHoldRequest,
  type OrderProCreateHoldResult,
  type OrderProErrorResponse,
  type OrderProGetHoldResult,
  type OrderProHoldTransitionResult,
  type OrderProQuoteRequest,
  type OrderProQuoteResult,
  type OrderProReleaseReason
} from "@/server/orderpro/contracts";

export type OrderProCorrelationOptions = {
  correlationId?: string;
};

export type OrderProIdempotentRequestOptions = OrderProCorrelationOptions & {
  idempotencyKey?: string;
};

export type OrderProClient = {
  authCheck(): Promise<OrderProAuthCheckSuccess>;
  quote(input: OrderProQuoteRequest, options?: OrderProIdempotentRequestOptions): Promise<OrderProQuoteResult>;
  createHold(input: OrderProCreateHoldRequest, options?: OrderProIdempotentRequestOptions): Promise<OrderProCreateHoldResult>;
  getHold(holdId: string, options?: OrderProCorrelationOptions): Promise<OrderProGetHoldResult>;
  confirmHold(
    holdId: string,
    options: OrderProCorrelationOptions & { orderId: string }
  ): Promise<OrderProHoldTransitionResult>;
  releaseHold(
    holdId: string,
    options: OrderProCorrelationOptions & { reason: OrderProReleaseReason }
  ): Promise<OrderProHoldTransitionResult>;
};

export type OrderProClientErrorCode =
  | "TOKEN_ACQUISITION_FAILED"
  | "ORDERPRO_AUTHENTICATION_FAILED"
  | "ORDERPRO_INSUFFICIENT_SCOPE"
  | "ORDERPRO_NOT_READY"
  | "ORDERPRO_INVALID_CLIENT_INPUT"
  | "ORDERPRO_NOT_FOUND"
  | "ORDERPRO_CONFLICT"
  | "ORDERPRO_QUOTE_EXPIRED"
  | "ORDERPRO_INVALID_REQUEST"
  | "ORDERPRO_RATE_LIMITED"
  | "ORDERPRO_PROTOCOL_ERROR"
  | "ORDERPRO_REQUEST_TIMEOUT"
  | "ORDERPRO_UNAVAILABLE";

export type OrderProAuthCheckEvent = Readonly<{
  event: "orderpro.auth_check";
  correlationId: string;
  attempt: 1 | 2;
  outcome: OrderProAuthCheckSuccess["result"] | OrderProAuthCheckFailure["result"] | OrderProClientErrorCode;
  httpStatus: number | null;
  durationMs: number;
  localDeliveryApiStatus?: OrderProAuthCheckSuccess["localDeliveryApiStatus"];
}>;

export class OrderProClientError extends Error {
  constructor(
    readonly code: OrderProClientErrorCode,
    readonly status: number | null,
    readonly correlationId: string,
    readonly upstreamCode?: string
  ) {
    super(code);
    this.name = "OrderProClientError";
  }
}

type OrderProClientDependencies = {
  config: OrderProApiConfiguration;
  tokenProvider: OrderProTokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  createCorrelationId?: () => string;
  createIdempotencyKey?: () => string;
  now?: () => number;
  observer?: (event: OrderProAuthCheckEvent) => void;
};

type AuthCheckAttempt =
  | { ok: true; value: OrderProAuthCheckSuccess }
  | { ok: false; failure: OrderProAuthCheckFailure; status: 401 | 403 | 503 };

type ApiAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; failure: OrderProErrorResponse; status: number };

type ApiRequest<T> = {
  method: "GET" | "POST";
  path: string;
  correlationId: string;
  idempotencyKey?: string;
  body?: unknown;
  successStatuses: readonly number[];
  successSchema: ZodType<T>;
  requireBodyCorrelation?: boolean;
  validateSuccess?: (status: number, value: T) => boolean;
};

const expectedAuthFailureStatus = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FAILED_CLOSED: 503
} as const;

function protocolError(status: number | null, correlationId: string) {
  return new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", status, correlationId);
}

async function readLimitedJson(response: Response, correlationId: string, signal: AbortSignal) {
  const contentType = response.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    throw protocolError(response.status, correlationId);
  }

  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      !Number.isSafeInteger(Number(declaredLength)) ||
      Number(declaredLength) > ORDERPRO_MAX_RESPONSE_BYTES)
  ) {
    throw protocolError(response.status, correlationId);
  }
  if (!response.body) throw protocolError(response.status, correlationId);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const cancelOnAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancelOnAbort, { once: true });

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > ORDERPRO_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw protocolError(response.status, correlationId);
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
    throw protocolError(response.status, correlationId);
  }
}

function authErrorForFailure(
  failure: OrderProAuthCheckFailure,
  status: 401 | 403 | 503,
  correlationId: string
) {
  switch (failure.result) {
    case "UNAUTHORIZED":
      return new OrderProClientError("ORDERPRO_AUTHENTICATION_FAILED", status, correlationId);
    case "FORBIDDEN":
      return new OrderProClientError("ORDERPRO_INSUFFICIENT_SCOPE", status, correlationId);
    case "FAILED_CLOSED":
      return new OrderProClientError("ORDERPRO_NOT_READY", status, correlationId);
  }
}

function apiErrorForFailure(failure: OrderProErrorResponse, status: number, correlationId: string) {
  let code: OrderProClientErrorCode;
  switch (status) {
    case 400:
    case 422:
      code = "ORDERPRO_INVALID_REQUEST";
      break;
    case 401:
      code = "ORDERPRO_AUTHENTICATION_FAILED";
      break;
    case 403:
      code = "ORDERPRO_INSUFFICIENT_SCOPE";
      break;
    case 404:
      code = "ORDERPRO_NOT_FOUND";
      break;
    case 409:
      code = "ORDERPRO_CONFLICT";
      break;
    case 410:
      code = "ORDERPRO_QUOTE_EXPIRED";
      break;
    case 429:
      code = "ORDERPRO_RATE_LIMITED";
      break;
    default:
      code = status >= 500 && status <= 599 ? "ORDERPRO_UNAVAILABLE" : "ORDERPRO_PROTOCOL_ERROR";
  }
  return new OrderProClientError(code, status, correlationId, failure.code);
}

function parseInput<T>(schema: ZodType<T>, value: unknown, correlationId: string) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new OrderProClientError("ORDERPRO_INVALID_CLIENT_INPUT", null, correlationId);
  }
  return parsed.data;
}

export function createOrderProClient({
  config,
  tokenProvider,
  fetchImpl = fetch,
  timeoutMs = 5000,
  createCorrelationId = () => crypto.randomUUID(),
  createIdempotencyKey = () => crypto.randomUUID(),
  now = Date.now,
  observer = () => undefined
}: OrderProClientDependencies): OrderProClient {
  function correlation(value?: string) {
    const parsed = orderProCorrelationIdSchema.safeParse(value ?? createCorrelationId());
    if (!parsed.success) {
      throw new OrderProClientError("ORDERPRO_INVALID_CLIENT_INPUT", null, "invalid-correlation-id");
    }
    return parsed.data;
  }

  function idempotency(value: string | undefined, correlationId: string) {
    const parsed = orderProIdempotencyKeySchema.safeParse(value ?? createIdempotencyKey());
    if (!parsed.success) {
      throw new OrderProClientError("ORDERPRO_INVALID_CLIENT_INPUT", null, correlationId);
    }
    return parsed.data;
  }

  function holdId(value: string, correlationId: string) {
    return parseInput(orderProStableIdSchema.max(160), value, correlationId);
  }

  function emit(event: OrderProAuthCheckEvent) {
    try {
      observer(event);
    } catch {
      // Observability must never alter the request outcome.
    }
  }

  async function accessToken(correlationId: string) {
    try {
      return await tokenProvider.getAccessToken();
    } catch {
      throw new OrderProClientError("TOKEN_ACQUISITION_FAILED", null, correlationId);
    }
  }

  async function fetchJson(input: {
    path: string;
    init: RequestInit;
    correlationId: string;
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${config.baseUrl}${input.path}`, {
        ...input.init,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      if (response.headers.get("x-correlation-id") !== input.correlationId) {
        throw protocolError(response.status, input.correlationId);
      }
      const body = await readLimitedJson(response, input.correlationId, controller.signal);
      return { response, body };
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new OrderProClientError("ORDERPRO_REQUEST_TIMEOUT", null, input.correlationId);
      }
      if (error instanceof OrderProClientError) throw error;
      throw new OrderProClientError("ORDERPRO_UNAVAILABLE", null, input.correlationId);
    } finally {
      clearTimeout(timer);
    }
  }

  async function performAuthCheck(correlationId: string, attempt: 1 | 2): Promise<AuthCheckAttempt> {
    const startedAt = now();
    const record = (
      outcome: OrderProAuthCheckEvent["outcome"],
      httpStatus: number | null,
      localDeliveryApiStatus?: OrderProAuthCheckSuccess["localDeliveryApiStatus"]
    ) =>
      emit({
        event: "orderpro.auth_check",
        correlationId,
        attempt,
        outcome,
        httpStatus,
        durationMs: Math.max(0, now() - startedAt),
        ...(localDeliveryApiStatus ? { localDeliveryApiStatus } : {})
      });

    try {
      const token = await accessToken(correlationId);
      const { response, body } = await fetchJson({
        path: "/api/v1/local-delivery/auth-check",
        correlationId,
        init: {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
            "x-correlation-id": correlationId
          }
        }
      });

      if (response.status === 200) {
        const parsed = orderProAuthCheckSuccessSchema.safeParse(body);
        if (!parsed.success || parsed.data.correlationId !== correlationId) {
          throw protocolError(response.status, correlationId);
        }
        record(parsed.data.result, response.status, parsed.data.localDeliveryApiStatus);
        return { ok: true, value: parsed.data };
      }

      const parsed = orderProAuthCheckFailureSchema.safeParse(body);
      if (!parsed.success || parsed.data.correlationId !== correlationId) {
        throw protocolError(response.status, correlationId);
      }
      const expectedStatus = expectedAuthFailureStatus[parsed.data.result];
      if (response.status !== expectedStatus) throw protocolError(response.status, correlationId);
      record(parsed.data.result, expectedStatus);
      return { ok: false, failure: parsed.data, status: expectedStatus };
    } catch (error) {
      const clientError = error instanceof OrderProClientError
        ? error
        : new OrderProClientError("ORDERPRO_UNAVAILABLE", null, correlationId);
      record(clientError.code, clientError.status);
      throw clientError;
    }
  }

  async function performApiAttempt<T>(request: ApiRequest<T>): Promise<ApiAttempt<T>> {
    const token = await accessToken(request.correlationId);
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "x-correlation-id": request.correlationId
    };
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
    if (request.body !== undefined) headers["content-type"] = "application/json";

    const { response, body } = await fetchJson({
      path: request.path,
      correlationId: request.correlationId,
      init: {
        method: request.method,
        headers,
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {})
      }
    });

    if (request.successStatuses.includes(response.status)) {
      const parsed = request.successSchema.safeParse(body);
      if (!parsed.success) throw protocolError(response.status, request.correlationId);
      if (
        request.requireBodyCorrelation &&
        (parsed.data as { correlationId?: unknown }).correlationId !== request.correlationId
      ) {
        throw protocolError(response.status, request.correlationId);
      }
      if (request.validateSuccess && !request.validateSuccess(response.status, parsed.data)) {
        throw protocolError(response.status, request.correlationId);
      }
      return { ok: true, value: parsed.data };
    }

    const parsed = orderProErrorResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.correlationId !== request.correlationId) {
      throw protocolError(response.status, request.correlationId);
    }
    if (response.status === 401 && parsed.data.code !== "UNAUTHORIZED") {
      throw protocolError(response.status, request.correlationId);
    }
    return { ok: false, failure: parsed.data, status: response.status };
  }

  async function execute<T>(request: ApiRequest<T>) {
    const first = await performApiAttempt(request);
    if (first.ok) return first.value;
    if (first.status === 401) {
      tokenProvider.invalidate();
      const second = await performApiAttempt(request);
      if (second.ok) return second.value;
      throw apiErrorForFailure(second.failure, second.status, request.correlationId);
    }
    throw apiErrorForFailure(first.failure, first.status, request.correlationId);
  }

  return {
    async authCheck() {
      const correlationId = correlation();
      const firstAttempt = await performAuthCheck(correlationId, 1);
      if (firstAttempt.ok) return firstAttempt.value;
      if (firstAttempt.failure.result === "UNAUTHORIZED") {
        tokenProvider.invalidate();
        const secondAttempt = await performAuthCheck(correlationId, 2);
        if (secondAttempt.ok) return secondAttempt.value;
        throw authErrorForFailure(secondAttempt.failure, secondAttempt.status, correlationId);
      }
      throw authErrorForFailure(firstAttempt.failure, firstAttempt.status, correlationId);
    },

    async quote(input, options = {}) {
      const correlationId = correlation(options.correlationId);
      const body = parseInput(orderProQuoteRequestSchema, input, correlationId);
      return execute({
        method: "POST",
        path: "/api/v1/local-delivery/quote",
        correlationId,
        idempotencyKey: idempotency(options.idempotencyKey, correlationId),
        body,
        successStatuses: [200],
        successSchema: orderProQuoteResultSchema,
        requireBodyCorrelation: true
      });
    },

    async createHold(input, options = {}) {
      const correlationId = correlation(options.correlationId);
      const body = parseInput(orderProCreateHoldRequestSchema, input, correlationId);
      return execute({
        method: "POST",
        path: "/api/v1/local-delivery/holds",
        correlationId,
        idempotencyKey: idempotency(options.idempotencyKey, correlationId),
        body,
        successStatuses: [200, 201],
        successSchema: orderProCreateHoldResultSchema,
        validateSuccess: (status, value) =>
          (status === 201 && !value.replayed) || (status === 200 && value.replayed)
      });
    },

    async getHold(id, options = {}) {
      const correlationId = correlation(options.correlationId);
      const parsedHoldId = holdId(id, correlationId);
      return execute({
        method: "GET",
        path: `/api/v1/local-delivery/holds/${encodeURIComponent(parsedHoldId)}`,
        correlationId,
        successStatuses: [200],
        successSchema: orderProGetHoldResultSchema
      });
    },

    async confirmHold(id, options) {
      const correlationId = correlation(options.correlationId);
      const parsedHoldId = holdId(id, correlationId);
      const body = parseInput(orderProConfirmHoldRequestSchema, { orderId: options.orderId }, correlationId);
      return execute({
        method: "POST",
        path: `/api/v1/local-delivery/holds/${encodeURIComponent(parsedHoldId)}/confirm`,
        correlationId,
        body,
        successStatuses: [200],
        successSchema: orderProHoldTransitionResultSchema
      });
    },

    async releaseHold(id, options) {
      const correlationId = correlation(options.correlationId);
      const parsedHoldId = holdId(id, correlationId);
      const body = parseInput(orderProReleaseHoldRequestSchema, { reason: options.reason }, correlationId);
      return execute({
        method: "POST",
        path: `/api/v1/local-delivery/holds/${encodeURIComponent(parsedHoldId)}/release`,
        correlationId,
        body,
        successStatuses: [200],
        successSchema: orderProHoldTransitionResultSchema
      });
    }
  };
}
