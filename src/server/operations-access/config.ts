/**
 * Parses the opt-in Operations access API boundary. Missing configuration is
 * deliberately treated as unavailable: the admin must not imply that access
 * was granted when no external contract is installed.
 */

import "server-only";

export const OPERATIONS_ACCESS_API_ORIGIN = "https://operation.modernstate.com";
export const OPERATIONS_ACCESS_CONTRACT = "ACCESS_ASSIGNMENTS_V1";
export const OPERATIONS_ACCESS_DEFAULT_TIMEOUT_MS = 5_000;

const requiredVariables = [
  "OPERATIONS_ACCESS_API_BASE_URL",
  "OPERATIONS_ACCESS_API_CONTRACT",
  "OPERATIONS_ACCESS_AUTH_MODE",
  "OPERATIONS_ACCESS_API_TOKEN"
] as const;

type RequiredVariable = (typeof requiredVariables)[number];
export type OperationsAccessConfigurationVariable =
  | "OPERATIONS_ACCESS_SYNC_MODE"
  | "OPERATIONS_ACCESS_TIMEOUT_MS"
  | RequiredVariable;

export type OperationsAccessApiConfiguration = {
  baseUrl: typeof OPERATIONS_ACCESS_API_ORIGIN;
  contract: typeof OPERATIONS_ACCESS_CONTRACT;
  bearerToken: string;
  timeoutMs: number;
};

export type OperationsAccessConfigurationResult =
  | { ready: false; mode: "unavailable"; reason: "NOT_CONFIGURED" | "DISABLED" }
  | {
      ready: false;
      mode: "unavailable";
      reason: "INVALID_CONFIGURATION";
      invalidVariables: OperationsAccessConfigurationVariable[];
    }
  | { ready: true; mode: "api_v1"; config: OperationsAccessApiConfiguration };

function isCanonicalApiOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.origin === OPERATIONS_ACCESS_API_ORIGIN &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function readTimeout(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const timeoutMs = Number(value);
  return Number.isSafeInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 15_000 ? timeoutMs : null;
}

export function parseOperationsAccessConfiguration(
  environment: Record<string, string | undefined>
): OperationsAccessConfigurationResult {
  const mode = environment.OPERATIONS_ACCESS_SYNC_MODE?.trim();
  if (!mode) return { ready: false, mode: "unavailable", reason: "NOT_CONFIGURED" };
  if (mode === "DISABLED") return { ready: false, mode: "unavailable", reason: "DISABLED" };
  if (mode !== "API_V1") {
    return {
      ready: false,
      mode: "unavailable",
      reason: "INVALID_CONFIGURATION",
      invalidVariables: ["OPERATIONS_ACCESS_SYNC_MODE"]
    };
  }

  const values = Object.fromEntries(
    requiredVariables.map((variable) => [variable, environment[variable]?.trim() ?? ""])
  ) as Record<RequiredVariable, string>;
  const invalidVariables: OperationsAccessConfigurationVariable[] = requiredVariables.filter(
    (variable) => !values[variable]
  );

  if (values.OPERATIONS_ACCESS_API_BASE_URL && !isCanonicalApiOrigin(values.OPERATIONS_ACCESS_API_BASE_URL)) {
    invalidVariables.push("OPERATIONS_ACCESS_API_BASE_URL");
  }
  if (
    values.OPERATIONS_ACCESS_API_CONTRACT &&
    values.OPERATIONS_ACCESS_API_CONTRACT !== OPERATIONS_ACCESS_CONTRACT
  ) {
    invalidVariables.push("OPERATIONS_ACCESS_API_CONTRACT");
  }
  if (values.OPERATIONS_ACCESS_AUTH_MODE && values.OPERATIONS_ACCESS_AUTH_MODE !== "BEARER") {
    invalidVariables.push("OPERATIONS_ACCESS_AUTH_MODE");
  }
  if (
    values.OPERATIONS_ACCESS_API_TOKEN &&
    (values.OPERATIONS_ACCESS_API_TOKEN.length < 32 || values.OPERATIONS_ACCESS_API_TOKEN.length > 4_096)
  ) {
    invalidVariables.push("OPERATIONS_ACCESS_API_TOKEN");
  }

  const rawTimeout = environment.OPERATIONS_ACCESS_TIMEOUT_MS?.trim() ?? "";
  const timeoutMs = rawTimeout ? readTimeout(rawTimeout) : OPERATIONS_ACCESS_DEFAULT_TIMEOUT_MS;
  if (timeoutMs === null) invalidVariables.push("OPERATIONS_ACCESS_TIMEOUT_MS");

  const uniqueInvalidVariables = [...new Set(invalidVariables)];
  if (uniqueInvalidVariables.length > 0 || timeoutMs === null) {
    return {
      ready: false,
      mode: "unavailable",
      reason: "INVALID_CONFIGURATION",
      invalidVariables: uniqueInvalidVariables
    };
  }

  return {
    ready: true,
    mode: "api_v1",
    config: {
      baseUrl: OPERATIONS_ACCESS_API_ORIGIN,
      contract: OPERATIONS_ACCESS_CONTRACT,
      bearerToken: values.OPERATIONS_ACCESS_API_TOKEN,
      timeoutMs
    }
  };
}

export function getOperationsAccessConfiguration() {
  return parseOperationsAccessConfiguration(process.env);
}
