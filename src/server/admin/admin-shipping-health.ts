/** Secret-free, read-only shipping configuration and contract health. */

import "server-only";

import { getOrderProShippingOrderConfiguration } from "@/server/orderpro/shipping-order-client";
import { isOrderProShippingCheckoutEnabled } from "@/server/shipping/shipping-service";

export type ShippingHealthState = "READY" | "TEST" | "INCOMPLETE" | "DISABLED";

export type AdminShippingHealth = {
  checkedAt: string;
  readOnly: true;
  shippingCheckoutReady: boolean;
  shippo: {
    state: ShippingHealthState;
    mode: "TEST" | "LIVE";
    configurationComplete: boolean;
    credentialState: "MISSING" | "MATCHES_MODE" | "MODE_MISMATCH";
    allowedCarriers: string[];
    webhookConfigured: boolean;
    origin: {
      label: string | null;
      street: "Configured (redacted)" | "Not configured";
      locality: string | null;
      phoneConfigured: boolean;
      emailConfigured: boolean;
    };
    missingConfiguration: string[];
  };
  orderPro: {
    state: Exclude<ShippingHealthState, "TEST">;
    checkoutEnabled: boolean;
    allocationContractConfigured: boolean;
    shippingOrderContractConfigured: boolean;
    missingConfiguration: string[];
  };
  handoff: {
    available: boolean;
    url: string | null;
    reason: "READY" | "NOT_CONFIGURED" | "INVALID_DESTINATION";
  };
  boundaries: string[];
};

const carrierLabels: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  dhl_express: "DHL Express"
};

function limited(value: string | undefined, maximum = 160) {
  return (value ?? "").trim().slice(0, maximum);
}

function csv(value: string | undefined) {
  return [...new Set((value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
}

function safeCarriers(value: string | undefined) {
  const raw = csv(value);
  const safe = raw.filter((carrier) => /^[a-z0-9][a-z0-9_-]{0,39}$/.test(carrier)).slice(0, 20);
  return {
    complete: safe.length > 0 && safe.length === raw.length,
    labels: safe.map((carrier) => carrierLabels[carrier] ?? carrier
      .split(/[_-]+/)
      .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
      .join(" "))
  };
}

function redactLabel(value: string) {
  if (!value) return null;
  if (value.length === 1) return `${value}•••`;
  return `${value[0]}•••${value.at(-1)}`;
}

function redactPostalCode(value: string) {
  if (!value) return "";
  return `${value.slice(0, 2)}•••`;
}

export function safeOperationsAdminHandoff(value: string | undefined): AdminShippingHealth["handoff"] {
  const raw = value?.trim();
  if (!raw) return { available: false, url: null, reason: "NOT_CONFIGURED" };
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "operation.modernstate.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return { available: false, url: null, reason: "INVALID_DESTINATION" };
    }
    return { available: true, url: url.toString(), reason: "READY" };
  } catch {
    return { available: false, url: null, reason: "INVALID_DESTINATION" };
  }
}

export function readAdminShippingHealth(
  environment: Record<string, string | undefined> = process.env,
  now: Date = new Date()
): AdminShippingHealth {
  const testMode = environment.SHIPPO_TEST_MODE?.trim() !== "false";
  const mode = testMode ? "TEST" : "LIVE";
  const token = limited(environment.SHIPPO_API_TOKEN, 4_096);
  const expectedTokenPrefix = testMode ? "shippo_test_" : "shippo_live_";
  const credentialState = !token
    ? "MISSING"
    : token.startsWith(expectedTokenPrefix) ? "MATCHES_MODE" : "MODE_MISMATCH";
  const carriers = safeCarriers(environment.SHIPPO_ALLOWED_CARRIERS);
  const origin = {
    name: limited(environment.SHIPPO_ORIGIN_NAME),
    company: limited(environment.SHIPPO_ORIGIN_COMPANY),
    street: limited(environment.SHIPPO_ORIGIN_STREET1),
    city: limited(environment.SHIPPO_ORIGIN_CITY, 80),
    state: limited(environment.SHIPPO_ORIGIN_STATE, 2).toUpperCase(),
    postalCode: limited(environment.SHIPPO_ORIGIN_ZIP, 10),
    phone: limited(environment.SHIPPO_ORIGIN_PHONE, 80),
    email: limited(environment.SHIPPO_ORIGIN_EMAIL, 254)
  };
  const originAddressConfigured = Boolean(
    origin.name && origin.company && origin.street && origin.city && /^[A-Z]{2}$/.test(origin.state) &&
    /^\d{5}(?:-\d{4})?$/.test(origin.postalCode)
  );
  const originContactConfigured = Boolean(origin.phone && origin.email);
  const missingShippoConfiguration = [
    credentialState !== "MATCHES_MODE" ? "Mode-matched API credential" : null,
    !carriers.complete ? "Allowed carrier names" : null,
    !originAddressConfigured ? "Origin address" : null,
    !originContactConfigured ? "Origin contact" : null
  ].filter((value): value is string => Boolean(value));
  const shippoConfiguredAtAll = Boolean(token || carriers.labels.length || origin.street);
  const shippoConfigurationComplete = missingShippoConfiguration.length === 0;
  const shippoState: ShippingHealthState = !shippoConfiguredAtAll
    ? "DISABLED"
    : !shippoConfigurationComplete ? "INCOMPLETE" : testMode ? "TEST" : "READY";

  const checkoutEnabled = isOrderProShippingCheckoutEnabled(environment);
  const shippingConfiguration = getOrderProShippingOrderConfiguration(environment);
  const allocationContractConfigured = Boolean(shippingConfiguration);
  const shippingOrderContractConfigured = Boolean(shippingConfiguration);
  const missingOrderProConfiguration = [
    !allocationContractConfigured ? "Shipping allocation contract" : null,
    !shippingOrderContractConfigured ? "Shipping order contract" : null
  ].filter((value): value is string => Boolean(value));
  const orderProState: AdminShippingHealth["orderPro"]["state"] = !checkoutEnabled
    ? "DISABLED"
    : missingOrderProConfiguration.length > 0 ? "INCOMPLETE" : "READY";

  return {
    checkedAt: now.toISOString(),
    readOnly: true,
    shippingCheckoutReady: shippoConfigurationComplete && orderProState === "READY",
    shippo: {
      state: shippoState,
      mode,
      configurationComplete: shippoConfigurationComplete,
      credentialState,
      allowedCarriers: carriers.labels,
      webhookConfigured: limited(environment.SHIPPO_WEBHOOK_SECRET, 4_096).length >= 32,
      origin: {
        label: redactLabel(origin.company || origin.name),
        street: origin.street ? "Configured (redacted)" : "Not configured",
        locality: origin.city && origin.state && origin.postalCode
          ? `${origin.city}, ${origin.state} ${redactPostalCode(origin.postalCode)}`
          : null,
        phoneConfigured: Boolean(origin.phone),
        emailConfigured: Boolean(origin.email)
      },
      missingConfiguration: missingShippoConfiguration
    },
    orderPro: {
      state: orderProState,
      checkoutEnabled,
      allocationContractConfigured,
      shippingOrderContractConfigured,
      missingConfiguration: missingOrderProConfiguration
    },
    handoff: safeOperationsAdminHandoff(environment.ORDERPRO_ADMIN_URL),
    boundaries: [
      "Rates are calculated by Shippo during checkout, not from this Admin page.",
      "Labels are never purchased from this module.",
      "Fulfillment queues and status changes remain in Operations."
    ]
  };
}
