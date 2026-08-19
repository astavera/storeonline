/**
 * Implements server-side config behavior and persistence boundaries.
 */

import "server-only";

export const ORDERPRO_STAGING_API_BASE_URL = "https://orderpro-staging.vercel.app";
export const ORDERPRO_STAGING_AUTH0_ISSUER = "https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/";
export const ORDERPRO_STAGING_AUTH0_TOKEN_ENDPOINT = "https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/oauth/token";
export const ORDERPRO_STAGING_AUDIENCE = "https://api.orderpro.internal/local-delivery/staging";
export const ORDERPRO_STAGING_SCOPES = ["local-delivery:holds", "local-delivery:quote"] as const;
export const ORDERPRO_PRODUCTION_AUDIENCE = "https://api.orderpro.internal/fulfillment/production";
export const ORDERPRO_PRODUCTION_SCOPES = [
  "fulfillment:status",
  "local-delivery:quote",
  "local-delivery:reserve",
  "local-delivery:settle",
  "pickup:quote",
  "pickup:reserve",
  "pickup:settle",
  "shipping:quote",
  "shipping:reserve",
  "shipping:settle"
] as const;

const requiredVariables = [
  "ORDERPRO_INTEGRATION_ENVIRONMENT",
  "ORDERPRO_API_BASE_URL",
  "ORDERPRO_AUTH0_ISSUER",
  "ORDERPRO_AUTH0_AUDIENCE",
  "ORDERPRO_AUTH0_CLIENT_ID",
  "ORDERPRO_AUTH0_CLIENT_SECRET",
  "ORDERPRO_AUTH0_SCOPES"
] as const;

type RequiredVariable = (typeof requiredVariables)[number];
type ConfigurationVariable = "ORDERPRO_M2M_AUTH_MODE" | RequiredVariable;

export type OrderProApiConfiguration = {
  baseUrl: string;
};

export type OrderProAuth0Configuration = {
  tokenEndpoint: string;
  audience: string;
  clientId: string;
  clientSecret: string;
  scopes: readonly string[];
};

export type OrderProM2mConfiguration = {
  environment: "STAGING" | "PRODUCTION";
  api: OrderProApiConfiguration;
  auth0: OrderProAuth0Configuration;
};

export type OrderProM2mConfigurationResult =
  | { enabled: false; state: "DISABLED" }
  | { enabled: false; state: "INVALID"; invalidVariables: ConfigurationVariable[] }
  | { enabled: true; state: "READY"; config: OrderProM2mConfiguration };

function parseScopes(value: string, expectedScopes: readonly string[]) {
  const scopes = value.split(/\s+/).filter(Boolean).sort();
  const expected = [...expectedScopes].sort();

  return scopes.length === expected.length && scopes.every((scope, index) => scope === expected[index]) ? expectedScopes : null;
}

function canonicalOrigin(value: string, requireHttps: boolean) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (!requireHttps && url.protocol === "http:")) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      url.origin === value.replace(/\/$/, "")
    ) ? url.origin : null;
  } catch {
    return null;
  }
}

function canonicalAuth0Issuer(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.hostname.endsWith(".auth0.com") && url.href === value;
  } catch {
    return false;
  }
}

export function parseOrderProM2mConfiguration(environment: Record<string, string | undefined>): OrderProM2mConfigurationResult {
  const mode = environment.ORDERPRO_M2M_AUTH_MODE?.trim();

  if (!mode || mode === "DISABLED") {
    return { enabled: false, state: "DISABLED" };
  }

  if (mode !== "AUTH0") {
    return { enabled: false, state: "INVALID", invalidVariables: ["ORDERPRO_M2M_AUTH_MODE"] };
  }

  const values = Object.fromEntries(requiredVariables.map((variable) => [variable, environment[variable]?.trim() ?? ""])) as Record<RequiredVariable, string>;
  const invalidVariables: ConfigurationVariable[] = requiredVariables.filter((variable) => !values[variable]);

  const integrationEnvironment = values.ORDERPRO_INTEGRATION_ENVIRONMENT;
  if (integrationEnvironment && integrationEnvironment !== "STAGING" && integrationEnvironment !== "PRODUCTION") {
    invalidVariables.push("ORDERPRO_INTEGRATION_ENVIRONMENT");
  }
  const production = integrationEnvironment === "PRODUCTION";
  const parsedBaseUrl = values.ORDERPRO_API_BASE_URL
    ? canonicalOrigin(values.ORDERPRO_API_BASE_URL, production)
    : null;
  if (
    values.ORDERPRO_API_BASE_URL &&
    (!parsedBaseUrl || (!production && parsedBaseUrl !== ORDERPRO_STAGING_API_BASE_URL))
  ) {
    invalidVariables.push("ORDERPRO_API_BASE_URL");
  }
  if (
    values.ORDERPRO_AUTH0_ISSUER &&
    (!canonicalAuth0Issuer(values.ORDERPRO_AUTH0_ISSUER) ||
      (!production && values.ORDERPRO_AUTH0_ISSUER !== ORDERPRO_STAGING_AUTH0_ISSUER))
  ) {
    invalidVariables.push("ORDERPRO_AUTH0_ISSUER");
  }
  const expectedAudience = production ? ORDERPRO_PRODUCTION_AUDIENCE : ORDERPRO_STAGING_AUDIENCE;
  if (values.ORDERPRO_AUTH0_AUDIENCE && values.ORDERPRO_AUTH0_AUDIENCE !== expectedAudience) {
    invalidVariables.push("ORDERPRO_AUTH0_AUDIENCE");
  }

  const expectedScopes = production ? ORDERPRO_PRODUCTION_SCOPES : ORDERPRO_STAGING_SCOPES;
  const scopes = values.ORDERPRO_AUTH0_SCOPES
    ? parseScopes(values.ORDERPRO_AUTH0_SCOPES, expectedScopes)
    : null;
  if (values.ORDERPRO_AUTH0_SCOPES && !scopes) {
    invalidVariables.push("ORDERPRO_AUTH0_SCOPES");
  }

  const uniqueInvalidVariables = [...new Set(invalidVariables)];
  if (uniqueInvalidVariables.length > 0 || !scopes) {
    return { enabled: false, state: "INVALID", invalidVariables: uniqueInvalidVariables };
  }

  return {
    enabled: true,
    state: "READY",
    config: {
      environment: production ? "PRODUCTION" : "STAGING",
      api: {
        baseUrl: parsedBaseUrl!
      },
      auth0: {
        tokenEndpoint: production
          ? `${values.ORDERPRO_AUTH0_ISSUER}oauth/token`
          : ORDERPRO_STAGING_AUTH0_TOKEN_ENDPOINT,
        audience: expectedAudience,
        clientId: values.ORDERPRO_AUTH0_CLIENT_ID,
        clientSecret: values.ORDERPRO_AUTH0_CLIENT_SECRET,
        scopes
      }
    }
  };
}

export function getOrderProM2mConfiguration() {
  return parseOrderProM2mConfiguration(process.env);
}

const ORDERPRO_LOCAL_DELIVERY_CHECKOUT_CODE_RELEASED = true;

export function isOrderProLocalDeliveryCheckoutRequested(environment: Record<string, string | undefined> = process.env) {
  return environment.ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED?.trim() === "true";
}

export function isOrderProLocalDeliveryCheckoutEnabled(environment: Record<string, string | undefined> = process.env) {
  return ORDERPRO_LOCAL_DELIVERY_CHECKOUT_CODE_RELEASED && isOrderProLocalDeliveryCheckoutRequested(environment);
}
