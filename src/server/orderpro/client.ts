import "server-only";
import type { OrderProApiConfiguration } from "@/server/orderpro/config";
import {
  ORDERPRO_MAX_RESPONSE_BYTES,
  orderProAuthCheckFailureSchema,
  orderProAuthCheckSuccessSchema,
  type OrderProAuthCheckFailure,
  type OrderProAuthCheckSuccess
} from "@/server/orderpro/contracts";
import type { OrderProTokenProvider } from "@/server/orderpro/auth0-token-provider";

export type OrderProClient = {
  authCheck(): Promise<OrderProAuthCheckSuccess>;
};

type OrderProClientErrorCode =
  | "TOKEN_ACQUISITION_FAILED"
  | "ORDERPRO_AUTHENTICATION_FAILED"
  | "ORDERPRO_INSUFFICIENT_SCOPE"
  | "ORDERPRO_NOT_READY"
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
    readonly correlationId: string
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
  now?: () => number;
  observer?: (event: OrderProAuthCheckEvent) => void;
};

type AuthCheckAttempt =
  | { ok: true; value: OrderProAuthCheckSuccess }
  | { ok: false; failure: OrderProAuthCheckFailure; status: 401 | 403 | 503 };

const expectedFailureStatus = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FAILED_CLOSED: 503
} as const;

async function readLimitedJson(response: Response, correlationId: string) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > ORDERPRO_MAX_RESPONSE_BYTES) {
    throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
  }

  const text = await response.text();
  if (text.length > ORDERPRO_MAX_RESPONSE_BYTES) {
    throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
  }
}

function errorForFailure(failure: OrderProAuthCheckFailure, status: 401 | 403 | 503, correlationId: string) {
  switch (failure.result) {
    case "UNAUTHORIZED":
      return new OrderProClientError("ORDERPRO_AUTHENTICATION_FAILED", status, correlationId);
    case "FORBIDDEN":
      return new OrderProClientError("ORDERPRO_INSUFFICIENT_SCOPE", status, correlationId);
    case "FAILED_CLOSED":
      return new OrderProClientError("ORDERPRO_NOT_READY", status, correlationId);
  }
}

export function createOrderProClient({
  config,
  tokenProvider,
  fetchImpl = fetch,
  timeoutMs = 5000,
  createCorrelationId = () => crypto.randomUUID(),
  now = Date.now,
  observer = () => undefined
}: OrderProClientDependencies): OrderProClient {
  function emit(event: OrderProAuthCheckEvent) {
    try {
      observer(event);
    } catch {
      // Observability must never alter the authentication result.
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

    let accessToken: string;
    try {
      accessToken = await tokenProvider.getAccessToken();
    } catch {
      const error = new OrderProClientError("TOKEN_ACQUISITION_FAILED", null, correlationId);
      record(error.code, error.status);
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${config.baseUrl}/api/v1/local-delivery/auth-check`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          "x-correlation-id": correlationId
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      const responseCorrelationId = response.headers.get("x-correlation-id");
      if (responseCorrelationId !== correlationId) {
        throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
      }

      const body = await readLimitedJson(response, correlationId);
      if (response.status === 200) {
        const parsed = orderProAuthCheckSuccessSchema.safeParse(body);
        if (!parsed.success || parsed.data.correlationId !== correlationId) {
          throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
        }

        record(parsed.data.result, response.status, parsed.data.localDeliveryApiStatus);
        return { ok: true, value: parsed.data };
      }

      const parsed = orderProAuthCheckFailureSchema.safeParse(body);
      if (!parsed.success || parsed.data.correlationId !== correlationId) {
        throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
      }

      const expectedStatus = expectedFailureStatus[parsed.data.result];
      if (response.status !== expectedStatus) {
        throw new OrderProClientError("ORDERPRO_PROTOCOL_ERROR", response.status, correlationId);
      }

      record(parsed.data.result, expectedStatus);
      return { ok: false, failure: parsed.data, status: expectedStatus };
    } catch (error) {
      if (error instanceof OrderProClientError) {
        record(error.code, error.status);
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new OrderProClientError("ORDERPRO_REQUEST_TIMEOUT", null, correlationId);
        record(timeoutError.code, timeoutError.status);
        throw timeoutError;
      }
      const unavailableError = new OrderProClientError("ORDERPRO_UNAVAILABLE", null, correlationId);
      record(unavailableError.code, unavailableError.status);
      throw unavailableError;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async authCheck() {
      const correlationId = createCorrelationId();
      const firstAttempt = await performAuthCheck(correlationId, 1);

      if (firstAttempt.ok) {
        return firstAttempt.value;
      }

      if (firstAttempt.failure.result === "UNAUTHORIZED") {
        tokenProvider.invalidate();
        const secondAttempt = await performAuthCheck(correlationId, 2);
        if (secondAttempt.ok) {
          return secondAttempt.value;
        }
        throw errorForFailure(secondAttempt.failure, secondAttempt.status, correlationId);
      }

      throw errorForFailure(firstAttempt.failure, firstAttempt.status, correlationId);
    }
  };
}
