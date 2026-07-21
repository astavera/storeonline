// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ORDERPRO_STAGING_API_BASE_URL,
  ORDERPRO_STAGING_AUDIENCE,
  ORDERPRO_STAGING_AUTH0_ISSUER,
  isOrderProLocalDeliveryCheckoutEnabled,
  isOrderProLocalDeliveryCheckoutRequested,
  parseOrderProM2mConfiguration
} from "@/server/orderpro/config";

const validEnvironment = {
  ORDERPRO_M2M_AUTH_MODE: "AUTH0",
  ORDERPRO_INTEGRATION_ENVIRONMENT: "STAGING",
  ORDERPRO_API_BASE_URL: ORDERPRO_STAGING_API_BASE_URL,
  ORDERPRO_AUTH0_ISSUER: ORDERPRO_STAGING_AUTH0_ISSUER,
  ORDERPRO_AUTH0_AUDIENCE: ORDERPRO_STAGING_AUDIENCE,
  ORDERPRO_AUTH0_CLIENT_ID: "storefront-client",
  ORDERPRO_AUTH0_CLIENT_SECRET: "server-secret",
  ORDERPRO_AUTH0_SCOPES: "local-delivery:holds local-delivery:quote"
};

describe("OrderPRO M2M configuration", () => {
  it("stays disabled unless AUTH0 is selected exactly", () => {
    expect(parseOrderProM2mConfiguration({})).toEqual({ enabled: false, state: "DISABLED" });
    expect(parseOrderProM2mConfiguration({ ORDERPRO_M2M_AUTH_MODE: "DISABLED" })).toEqual({ enabled: false, state: "DISABLED" });
    expect(parseOrderProM2mConfiguration({ ORDERPRO_M2M_AUTH_MODE: "auth0" })).toEqual({
      enabled: false,
      state: "INVALID",
      invalidVariables: ["ORDERPRO_M2M_AUTH_MODE"]
    });
  });

  it("accepts only the canonical STAGING boundary and exact scopes", () => {
    const result = parseOrderProM2mConfiguration(validEnvironment);

    expect(result.enabled).toBe(true);
    if (!result.enabled) {
      throw new Error("Expected a valid OrderPRO configuration.");
    }
    expect(result.config).toMatchObject({
      environment: "STAGING",
      api: {
        baseUrl: ORDERPRO_STAGING_API_BASE_URL
      },
      auth0: {
        tokenEndpoint: "https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/oauth/token",
        audience: ORDERPRO_STAGING_AUDIENCE,
        scopes: ["local-delivery:holds", "local-delivery:quote"]
      }
    });
  });

  it("rejects every Auth0 tenant except the approved STAGING issuer", () => {
    expect(
      parseOrderProM2mConfiguration({
        ...validEnvironment,
        ORDERPRO_AUTH0_ISSUER: "https://another-tenant.us.auth0.com/"
      })
    ).toEqual({
      enabled: false,
      state: "INVALID",
      invalidVariables: ["ORDERPRO_AUTH0_ISSUER"]
    });
  });

  it("reports only variable names when credentials or boundaries are invalid", () => {
    const result = parseOrderProM2mConfiguration({
      ...validEnvironment,
      ORDERPRO_API_BASE_URL: "https://example.com",
      ORDERPRO_AUTH0_CLIENT_SECRET: "",
      ORDERPRO_AUTH0_SCOPES: "local-delivery:quote"
    });

    expect(result).toEqual({
      enabled: false,
      state: "INVALID",
      invalidVariables: ["ORDERPRO_AUTH0_CLIENT_SECRET", "ORDERPRO_API_BASE_URL", "ORDERPRO_AUTH0_SCOPES"]
    });
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("recognizes only an exact checkout request and keeps the unreleased flow disabled", () => {
    expect(isOrderProLocalDeliveryCheckoutRequested({})).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutRequested({ ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "false" })).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutRequested({ ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "TRUE" })).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutRequested({ ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "1" })).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutRequested({ ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "true" })).toBe(true);

    expect(isOrderProLocalDeliveryCheckoutEnabled({})).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutEnabled({ ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "false" })).toBe(false);
    expect(isOrderProLocalDeliveryCheckoutEnabled({ ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "true" })).toBe(false);
  });
});
