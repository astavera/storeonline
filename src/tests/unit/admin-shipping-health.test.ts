// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  readAdminShippingHealth,
  safeOperationsAdminHandoff
} from "@/server/admin/admin-shipping-health";

const completeEnvironment = {
  SHIPPO_API_TOKEN: "shippo_live_server-secret-token",
  SHIPPO_TEST_MODE: "false",
  SHIPPO_ALLOWED_CARRIERS: "usps,fedex,dhl_express",
  SHIPPO_ORIGIN_NAME: "Modern State Shipping",
  SHIPPO_ORIGIN_COMPANY: "Modern State LLC",
  SHIPPO_ORIGIN_STREET1: "123 Private Warehouse Road",
  SHIPPO_ORIGIN_CITY: "Englewood",
  SHIPPO_ORIGIN_STATE: "NJ",
  SHIPPO_ORIGIN_ZIP: "07631",
  SHIPPO_ORIGIN_PHONE: "+12015550123",
  SHIPPO_ORIGIN_EMAIL: "warehouse-private@example.com",
  SHIPPO_WEBHOOK_SECRET: "webhook-secret-at-least-thirty-two-characters",
  ORDERPRO_SHIPPING_CHECKOUT_ENABLED: "true",
  ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL: "https://operation.modernstate.com",
  ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET: "shipping-secret-at-least-thirty-two-characters",
  ORDERPRO_ADMIN_URL: "https://operation.modernstate.com/admin"
};

describe("Admin shipping health", () => {
  it("is disabled and secret-free when shipping is not configured", () => {
    const health = readAdminShippingHealth({}, new Date("2026-08-19T12:00:00.000Z"));

    expect(health).toMatchObject({
      readOnly: true,
      shippingCheckoutReady: false,
      shippo: { state: "DISABLED", mode: "TEST", credentialState: "MISSING" },
      orderPro: { state: "DISABLED", checkoutEnabled: false },
      handoff: { available: false, url: null, reason: "NOT_CONFIGURED" }
    });
  });

  it("reports complete live configuration without exposing credentials or origin PII", () => {
    const health = readAdminShippingHealth(completeEnvironment, new Date("2026-08-19T12:00:00.000Z"));

    expect(health).toMatchObject({
      shippingCheckoutReady: true,
      shippo: {
        state: "READY",
        mode: "LIVE",
        configurationComplete: true,
        credentialState: "MATCHES_MODE",
        allowedCarriers: ["USPS", "FedEx", "DHL Express"],
        webhookConfigured: true,
        origin: {
          label: "M•••C",
          street: "Configured (redacted)",
          locality: "Englewood, NJ 07•••",
          phoneConfigured: true,
          emailConfigured: true
        }
      },
      orderPro: {
        state: "READY",
        checkoutEnabled: true,
        allocationContractConfigured: true,
        shippingOrderContractConfigured: true
      },
      handoff: {
        available: true,
        url: "https://operation.modernstate.com/admin",
        reason: "READY"
      }
    });
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain(completeEnvironment.SHIPPO_API_TOKEN);
    expect(serialized).not.toContain(completeEnvironment.SHIPPO_ORIGIN_STREET1);
    expect(serialized).not.toContain(completeEnvironment.SHIPPO_ORIGIN_PHONE);
    expect(serialized).not.toContain(completeEnvironment.SHIPPO_ORIGIN_EMAIL);
    expect(serialized).not.toContain(completeEnvironment.ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET);
  });

  it("detects a Shippo credential that does not match the declared mode", () => {
    const health = readAdminShippingHealth({
      ...completeEnvironment,
      SHIPPO_TEST_MODE: "true"
    });

    expect(health.shippo).toMatchObject({
      state: "INCOMPLETE",
      mode: "TEST",
      configurationComplete: false,
      credentialState: "MODE_MISMATCH"
    });
    expect(health.shippo.missingConfiguration).toContain("Mode-matched API credential");
    expect(health.shippingCheckoutReady).toBe(false);
  });

  it("reports an enabled but incomplete OrderPro shipping contract", () => {
    const health = readAdminShippingHealth({
      ...completeEnvironment,
      ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL: "",
      ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET: ""
    });

    expect(health.orderPro).toEqual({
      state: "INCOMPLETE",
      checkoutEnabled: true,
      allocationContractConfigured: false,
      shippingOrderContractConfigured: false,
      missingConfiguration: ["Shipping allocation contract", "Shipping order contract"]
    });
    expect(health.shippingCheckoutReady).toBe(false);
  });

  it("allows only the exact HTTPS Operations host without credentials, query, or fragment", () => {
    expect(safeOperationsAdminHandoff("https://operation.modernstate.com/admin")).toMatchObject({ available: true });
    expect(safeOperationsAdminHandoff("https://operation.modernstate.com.attacker.example/admin")).toEqual({ available: false, url: null, reason: "INVALID_DESTINATION" });
    expect(safeOperationsAdminHandoff("https://operation.modernstate.com/admin?token=secret")).toEqual({ available: false, url: null, reason: "INVALID_DESTINATION" });
    expect(safeOperationsAdminHandoff("http://operation.modernstate.com/admin")).toEqual({ available: false, url: null, reason: "INVALID_DESTINATION" });
  });
});
