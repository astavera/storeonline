import "server-only";
import { z } from "zod";
import type { OrderProAuth0Configuration } from "@/server/orderpro/config";
import { ORDERPRO_MAX_RESPONSE_BYTES } from "@/server/orderpro/contracts";

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1).max(8192).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
    expires_in: z.number().int().min(1).max(3600),
    scope: z.string().optional()
  })
  .passthrough();

export type OrderProTokenProvider = {
  getAccessToken(): Promise<string>;
  invalidate(): void;
};

export class OrderProTokenError extends Error {
  constructor(readonly code: "TOKEN_REQUEST_FAILED" | "TOKEN_RESPONSE_INVALID" | "TOKEN_REQUEST_TIMEOUT") {
    super(code);
    this.name = "OrderProTokenError";
  }
}

type TokenProviderDependencies = {
  config: OrderProAuth0Configuration;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

function scopesAreExact(value: string | undefined, expected: readonly string[]) {
  if (value === undefined) {
    return true;
  }

  const actual = value.split(/\s+/).filter(Boolean).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((scope, index) => scope === sortedExpected[index]);
}

async function readLimitedJson(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > ORDERPRO_MAX_RESPONSE_BYTES) {
    throw new OrderProTokenError("TOKEN_RESPONSE_INVALID");
  }

  const text = await response.text();
  if (text.length > ORDERPRO_MAX_RESPONSE_BYTES) {
    throw new OrderProTokenError("TOKEN_RESPONSE_INVALID");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OrderProTokenError("TOKEN_RESPONSE_INVALID");
  }
}

export function createAuth0TokenProvider({ config, fetchImpl = fetch, now = Date.now, timeoutMs = 5000 }: TokenProviderDependencies): OrderProTokenProvider {
  let cachedToken: { accessToken: string; refreshAt: number } | null = null;
  let inFlight: Promise<string> | null = null;

  async function acquireAccessToken() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(config.tokenEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          audience: config.audience,
          grant_type: "client_credentials",
          scope: config.scopes.join(" ")
        }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new OrderProTokenError("TOKEN_REQUEST_FAILED");
      }

      const parsed = tokenResponseSchema.safeParse(await readLimitedJson(response));
      if (!parsed.success || !scopesAreExact(parsed.data.scope, config.scopes)) {
        throw new OrderProTokenError("TOKEN_RESPONSE_INVALID");
      }

      const issuedAt = now();
      const lifetimeMs = parsed.data.expires_in * 1000;
      const refreshSkewMs = Math.min(60_000, Math.floor(lifetimeMs / 10));
      const refreshAt = lifetimeMs <= 60_000 ? issuedAt : issuedAt + lifetimeMs - refreshSkewMs;
      cachedToken = { accessToken: parsed.data.access_token, refreshAt };

      return parsed.data.access_token;
    } catch (error) {
      if (error instanceof OrderProTokenError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new OrderProTokenError("TOKEN_REQUEST_TIMEOUT");
      }
      throw new OrderProTokenError("TOKEN_REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async getAccessToken() {
      if (cachedToken && cachedToken.refreshAt > now()) {
        return cachedToken.accessToken;
      }

      if (!inFlight) {
        inFlight = acquireAccessToken().finally(() => {
          inFlight = null;
        });
      }

      return inFlight;
    },
    invalidate() {
      cachedToken = null;
    }
  };
}
