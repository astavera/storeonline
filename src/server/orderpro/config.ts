import "server-only";

export const ORDERPRO_STAGING_API_BASE_URL = "https://orderpro-staging.vercel.app";
export const ORDERPRO_STAGING_AUTH0_ISSUER = "https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/";
export const ORDERPRO_STAGING_AUTH0_TOKEN_ENDPOINT = "https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/oauth/token";
export const ORDERPRO_STAGING_AUDIENCE = "https://api.orderpro.internal/local-delivery/staging";
export const ORDERPRO_STAGING_SCOPES = ["local-delivery:holds", "local-delivery:quote"] as const;

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
  baseUrl: typeof ORDERPRO_STAGING_API_BASE_URL;
};

export type OrderProAuth0Configuration = {
  tokenEndpoint: typeof ORDERPRO_STAGING_AUTH0_TOKEN_ENDPOINT;
  audience: typeof ORDERPRO_STAGING_AUDIENCE;
  clientId: string;
  clientSecret: string;
  scopes: typeof ORDERPRO_STAGING_SCOPES;
};

export type OrderProM2mConfiguration = {
  environment: "STAGING";
  api: OrderProApiConfiguration;
  auth0: OrderProAuth0Configuration;
};

export type OrderProM2mConfigurationResult =
  | { enabled: false; state: "DISABLED" }
  | { enabled: false; state: "INVALID"; invalidVariables: ConfigurationVariable[] }
  | { enabled: true; state: "READY"; config: OrderProM2mConfiguration };

function parseScopes(value: string) {
  const scopes = value.split(/\s+/).filter(Boolean).sort();
  const expected = [...ORDERPRO_STAGING_SCOPES].sort();

  return scopes.length === expected.length && scopes.every((scope, index) => scope === expected[index]) ? ORDERPRO_STAGING_SCOPES : null;
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

  if (values.ORDERPRO_INTEGRATION_ENVIRONMENT && values.ORDERPRO_INTEGRATION_ENVIRONMENT !== "STAGING") {
    invalidVariables.push("ORDERPRO_INTEGRATION_ENVIRONMENT");
  }
  if (values.ORDERPRO_API_BASE_URL && values.ORDERPRO_API_BASE_URL !== ORDERPRO_STAGING_API_BASE_URL) {
    invalidVariables.push("ORDERPRO_API_BASE_URL");
  }
  if (values.ORDERPRO_AUTH0_ISSUER && values.ORDERPRO_AUTH0_ISSUER !== ORDERPRO_STAGING_AUTH0_ISSUER) {
    invalidVariables.push("ORDERPRO_AUTH0_ISSUER");
  }
  if (values.ORDERPRO_AUTH0_AUDIENCE && values.ORDERPRO_AUTH0_AUDIENCE !== ORDERPRO_STAGING_AUDIENCE) {
    invalidVariables.push("ORDERPRO_AUTH0_AUDIENCE");
  }

  const scopes = values.ORDERPRO_AUTH0_SCOPES ? parseScopes(values.ORDERPRO_AUTH0_SCOPES) : null;
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
      environment: "STAGING",
      api: {
        baseUrl: ORDERPRO_STAGING_API_BASE_URL
      },
      auth0: {
        tokenEndpoint: ORDERPRO_STAGING_AUTH0_TOKEN_ENDPOINT,
        audience: ORDERPRO_STAGING_AUDIENCE,
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
