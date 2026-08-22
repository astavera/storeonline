/**
 * Selects either the configured API adapter or the explicit unavailable mode.
 */

import "server-only";

import { getOperationsAccessConfiguration, parseOperationsAccessConfiguration } from "@/server/operations-access/config";
import { createOperationsAccessHttpAdapter } from "@/server/operations-access/http-adapter";
import type { OperationsAccessClient } from "@/server/operations-access/contracts";

export type OperationsAccessRuntime =
  | {
      ready: false;
      mode: "unavailable";
      reason: "NOT_CONFIGURED" | "DISABLED" | "INVALID_CONFIGURATION";
      invalidVariables?: string[];
    }
  | { ready: true; mode: "api_v1"; client: OperationsAccessClient };

export function createOperationsAccessRuntime(input: {
  environment: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  createCorrelationId?: () => string;
}): OperationsAccessRuntime {
  const configuration = parseOperationsAccessConfiguration(input.environment);
  if (!configuration.ready) return configuration;
  return {
    ready: true,
    mode: "api_v1",
    client: createOperationsAccessHttpAdapter({
      config: configuration.config,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.createCorrelationId ? { createCorrelationId: input.createCorrelationId } : {})
    })
  };
}

let runtimeClient: OperationsAccessClient | null = null;

export function getOperationsAccessRuntime(): OperationsAccessRuntime {
  const configuration = getOperationsAccessConfiguration();
  if (!configuration.ready) return configuration;
  if (!runtimeClient) runtimeClient = createOperationsAccessHttpAdapter({ config: configuration.config });
  return { ready: true, mode: "api_v1", client: runtimeClient };
}
