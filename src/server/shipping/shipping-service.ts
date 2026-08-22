/**
 * Implements server-side shipping service behavior and persistence boundaries.
 */

import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/validation/env";
import {
  quoteCartWithProducts,
  type CartQuote
} from "@/server/checkout/cart-service";
import {
  getOrderProShippingOrderClient,
  orderProShippingCommandIdentity
} from "@/server/orderpro/shipping-order-client";
import {
  readMappedOperationalStoreLocations,
  readPublishedStorefrontShippingPoliciesByVariationIds,
  readPostgresStorefrontProductsByVariationIds
} from "@/server/square/postgres-catalog-store";

export type ShippingProvider = "shippo" | "fedex-direct" | "ups-direct";

const SHIPPO_API_BASE_URL = "https://api.goshippo.com";
const SHIPPING_QUOTE_TTL_MS = 15 * 60_000;
const requestTimeoutMs = 12_000;

export const shippingAddressSchema = z.object({
  line1: z.string().trim().min(5).max(160),
  line2: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  country: z.literal("US")
}).strict();

export const shippingSelectionSchema = z.object({
  quoteToken: z.string().min(40).max(4_000),
  rateId: z.string().trim().min(8).max(200),
  amountCents: z.number().int().positive(),
  carrier: z.string().trim().min(2).max(80),
  serviceName: z.string().trim().min(2).max(120),
  readyToShipDate: z.string().date(),
  address: shippingAddressSchema
}).strict();

export type ShippingAddress = z.infer<typeof shippingAddressSchema>;
export type ShippingSelection = z.infer<typeof shippingSelectionSchema>;

type ShippingConfiguration = {
  token: string;
  testMode: boolean;
  allowedCarriers: string[];
  origin: {
    name: string;
    company: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: "US";
    phone: string;
    email: string;
  };
};

type QuoteTokenPayload = {
  v: 2;
  rateId: string;
  amountCents: number;
  carrier: string;
  serviceName: string;
  expiresAt: string;
  addressHash: string;
  cartHash: string;
  packageHash: string;
  locationId: string;
  readyToShipDate: string;
  policyVersion: string;
};

type PackageSnapshotLine = {
  squareVariationId: string;
  quantity: number;
  length: string;
  width: string;
  height: string;
  weight: string;
};

const carrierAccountSchema = z.object({
  object_id: z.string().min(1),
  carrier: z.string().min(1),
  active: z.boolean(),
  test: z.boolean()
}).passthrough();

const shippoRateSchema = z.object({
  object_id: z.string().min(1),
  amount: z.string().regex(/^\d+(?:\.\d{1,4})?$/),
  currency: z.literal("USD"),
  provider: z.string().min(1),
  test: z.boolean(),
  estimated_days: z.number().int().nonnegative().nullable().optional(),
  duration_terms: z.string().nullable().optional(),
  servicelevel: z.object({
    name: z.string().min(1),
    token: z.string().min(1).optional(),
    terms: z.string().nullable().optional()
  }).passthrough()
}).passthrough();

const shipmentSchema = z.object({
  object_id: z.string().min(1),
  status: z.string().min(1),
  test: z.boolean(),
  rates: z.array(shippoRateSchema),
  messages: z.array(z.unknown()).optional()
}).passthrough();

export class ShippingUnavailableError extends Error {
  constructor(message = "Shipping is temporarily unavailable. Please choose pickup or local delivery.") {
    super(message);
    this.name = "ShippingUnavailableError";
  }
}

export function getInitialShippingProviders(): ShippingProvider[] {
  return ["shippo"];
}

export function isOrderProShippingCheckoutEnabled(environment: Record<string, string | undefined> = process.env) {
  return environment.ORDERPRO_SHIPPING_CHECKOUT_ENABLED?.trim() === "true";
}

export function assertProductsAreShippable(items: Array<{ isShippable: boolean }>) {
  if (items.some((item) => !item.isShippable)) {
    throw new Error("Cart contains products that are not eligible for warehouse shipping.");
  }
}

export async function quoteShippingCart(input: {
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
}): Promise<CartQuote> {
  return (await readShippingCartContext(input)).quote;
}

async function readShippingCartContext(input: {
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
}) {
  const unitCount = input.items.reduce((total, item) => total + item.quantity, 0);
  if (input.items.length === 0 || input.items.some((item) => (
    !item.squareVariationId.trim() || !Number.isInteger(item.quantity) || item.quantity < 1
  ))) {
    throw new ShippingUnavailableError("The shipping cart is invalid.");
  }
  if (new Set(input.items.map((item) => item.squareVariationId.trim())).size !== input.items.length) {
    throw new ShippingUnavailableError("Duplicate shipping cart lines are not allowed.");
  }
  if (unitCount > 30) {
    throw new ShippingUnavailableError("Shipping supports carts of up to 30 physical units.");
  }
  const location = (await readMappedOperationalStoreLocations()).find((candidate) => candidate.id === input.locationId);
  if (!location?.shippingFulfillmentEnabled) {
    throw new ShippingUnavailableError("The selected store is not enabled as a shipping source.");
  }

  const variationIds = input.items.map((item) => item.squareVariationId);
  const [products, policies] = await Promise.all([
    readPostgresStorefrontProductsByVariationIds(variationIds, {
      squareLocationIds: [location.squareLocationId]
    }),
    readPublishedStorefrontShippingPoliciesByVariationIds(variationIds)
  ]);
  const policiesByVariationId = new Map(policies.map((policy) => [policy.squareVariationId, policy]));
  if (
    new Set(variationIds).size !== policies.length ||
    policies.some((policy) => ![
      policy.packageLengthIn,
      policy.packageWidthIn,
      policy.packageHeightIn,
      policy.packageWeightLb
    ].every(positiveDecimal))
  ) {
    throw new ShippingUnavailableError("Every product must be published for shipping with complete package dimensions and weight.");
  }

  const quote = quoteCartWithProducts(
    input,
    products.map((product) => ({
      ...product,
      fulfillmentModes: ["shipping"],
      // OrderPRO is the shipping inventory authority. Square remains the
      // catalog, price, order, and payment system.
      inventoryTracked: false,
      availableQuantity: null
    })),
    {
      catalogSource: "postgres",
      inventoryAsOf: null,
      warnings: ["Shipping availability is verified directly by OrderPRO before rates and again before Square checkout."],
      location
    }
  );
  if (quote.errors.length > 0) throw new ShippingUnavailableError(quote.errors.join(" "));

  const packageSnapshot = input.items
    .map((item) => {
      const policy = policiesByVariationId.get(item.squareVariationId)!;
      return {
        squareVariationId: item.squareVariationId,
        quantity: item.quantity,
        length: policy.packageLengthIn,
        width: policy.packageWidthIn,
        height: policy.packageHeightIn,
        weight: policy.packageWeightLb
      };
    })
    .sort((left, right) => left.squareVariationId.localeCompare(right.squareVariationId));
  const parcels = [consolidateShippingParcel(packageSnapshot)];
  return {
    quote,
    parcels,
    packageHash: hashValue(JSON.stringify(packageSnapshot))
  };
}

async function readOrderProShippingAllocation(input: {
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
}) {
  const orderPro = getOrderProShippingOrderClient();
  if (!orderPro) throw new ShippingUnavailableError("OrderPRO shipping availability is not configured.");
  const quoteIdentity = orderProShippingCommandIdentity("quote", input.locationId, normalizedCart(input.items));
  try {
    return await orderPro.quote({
      locationId: input.locationId,
      items: input.items,
      idempotencyKey: quoteIdentity,
      correlationId: quoteIdentity
    });
  } catch {
    throw new ShippingUnavailableError("OrderPRO shipping availability is temporarily unavailable.");
  }
}

export async function quoteShippingRates(input: {
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
  address: ShippingAddress;
  fetchImpl?: typeof fetch;
  now?: Date;
}) {
  if (!isOrderProShippingCheckoutEnabled()) throw new ShippingUnavailableError();
  const configuration = getShippingConfiguration();
  const address = shippingAddressSchema.parse(input.address);
  const cart = await readShippingCartContext(input);

  const allocation = await readOrderProShippingAllocation(input);
  if (!allocation.available) {
    throw new ShippingUnavailableError("OrderPRO cannot allocate this cart for shipping right now.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const carrierAccounts = await shippoRequest(
    "/carrier_accounts?service_levels=true&results=100",
    { method: "GET" },
    z.union([
      z.array(carrierAccountSchema),
      z.object({ results: z.array(carrierAccountSchema) }).transform((value) => value.results)
    ]),
    configuration,
    fetchImpl
  );
  const allowedAccountIds = carrierAccounts
    .filter((account) => (
      account.active &&
      account.test === configuration.testMode &&
      configuration.allowedCarriers.includes(account.carrier.toLowerCase())
    ))
    .map((account) => account.object_id);
  if (allowedAccountIds.length === 0) {
    throw new ShippingUnavailableError("No approved Shippo carrier account is active.");
  }

  const shipment = await shippoRequest(
    "/shipments/",
    {
      method: "POST",
      body: JSON.stringify({
        address_from: configuration.origin,
        address_to: {
          name: "Shipping customer",
          street1: address.line1,
          ...(address.line2 ? { street2: address.line2 } : {}),
          city: address.city,
          state: address.state,
          zip: address.postalCode,
          country: address.country
        },
        parcels: cart.parcels,
        carrier_accounts: allowedAccountIds,
        async: false
      })
    },
    shipmentSchema,
    configuration,
    fetchImpl
  );
  if (shipment.test !== configuration.testMode) {
    throw new ShippingUnavailableError("Shippo returned a shipment from the wrong environment.");
  }
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + SHIPPING_QUOTE_TTL_MS).toISOString();
  const cartHash = hashValue(normalizedCart(input.items));
  const addressHash = hashValue(normalizedAddress(address));
  const rates = shipment.rates
    .filter((rate) => rate.test === configuration.testMode)
    .map((rate) => publicRate(rate, {
      expiresAt,
      cartHash,
      packageHash: cart.packageHash,
      addressHash,
      locationId: input.locationId,
      readyToShipDate: allocation.readyToShipDate,
      policyVersion: allocation.policyVersion
    }, configuration))
    .sort((left, right) => left.amountCents - right.amountCents);
  if (rates.length === 0) throw new ShippingUnavailableError("Shippo did not return an approved shipping rate.");

  return {
    quote: cart.quote,
    allocation: {
      policyVersion: allocation.policyVersion,
      fulfillmentNodeId: allocation.fulfillmentNodeId,
      requiresStoreTransfer: allocation.requiresStoreTransfer,
      transferLeadTimeDays: allocation.transferLeadTimeDays,
      readyToShipDate: allocation.readyToShipDate
    },
    rates
  };
}

export async function validateShippingSelection(input: {
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
  selection: ShippingSelection;
  fetchImpl?: typeof fetch;
  now?: Date;
}) {
  if (!isOrderProShippingCheckoutEnabled()) throw new ShippingUnavailableError();
  const configuration = getShippingConfiguration();
  const selection = shippingSelectionSchema.parse(input.selection);
  const token = verifyQuoteToken(selection.quoteToken, configuration);
  const now = input.now ?? new Date();
  if (Date.parse(token.expiresAt) <= now.getTime()) throw new ShippingUnavailableError("The shipping rate expired. Check rates again.");
  if (
    token.rateId !== selection.rateId ||
    token.amountCents !== selection.amountCents ||
    token.carrier !== selection.carrier ||
    token.serviceName !== selection.serviceName ||
    token.readyToShipDate !== selection.readyToShipDate ||
    token.locationId !== input.locationId ||
    token.cartHash !== hashValue(normalizedCart(input.items)) ||
    token.addressHash !== hashValue(normalizedAddress(selection.address))
  ) {
    throw new ShippingUnavailableError("The shipping rate does not match this cart and address.");
  }

  const cart = await readShippingCartContext(input);
  if (token.packageHash !== cart.packageHash) {
    throw new ShippingUnavailableError("The product shipping package changed. Check rates again.");
  }

  const allocation = await readOrderProShippingAllocation(input);
  if (
    !allocation.available ||
    allocation.policyVersion !== token.policyVersion ||
    allocation.readyToShipDate !== token.readyToShipDate
  ) {
    throw new ShippingUnavailableError("OrderPRO shipping availability changed. Check rates again.");
  }

  const liveRate = await shippoRequest(
    `/rates/${encodeURIComponent(selection.rateId)}`,
    { method: "GET" },
    shippoRateSchema,
    configuration,
    input.fetchImpl ?? fetch
  );
  const amountCents = moneyToCents(liveRate.amount);
  if (
    liveRate.test !== configuration.testMode ||
    liveRate.object_id !== token.rateId ||
    amountCents !== token.amountCents ||
    liveRate.provider !== token.carrier ||
    liveRate.servicelevel.name !== token.serviceName
  ) {
    throw new ShippingUnavailableError("The carrier changed this rate. Check rates again.");
  }

  return {
    rateId: liveRate.object_id,
    amountCents,
    carrier: liveRate.provider,
    serviceName: liveRate.servicelevel.name,
    readyToShipDate: allocation.readyToShipDate,
    address: selection.address
  };
}

function getShippingConfiguration(): ShippingConfiguration {
  const values = {
    token: env.SHIPPO_API_TOKEN?.trim() ?? "",
    testMode: env.SHIPPO_TEST_MODE === "true",
    allowedCarriers: csv(env.SHIPPO_ALLOWED_CARRIERS),
    name: env.SHIPPO_ORIGIN_NAME?.trim() ?? "",
    company: env.SHIPPO_ORIGIN_COMPANY?.trim() ?? "",
    street1: env.SHIPPO_ORIGIN_STREET1?.trim() ?? "",
    city: env.SHIPPO_ORIGIN_CITY?.trim() ?? "",
    state: env.SHIPPO_ORIGIN_STATE?.trim().toUpperCase() ?? "",
    zip: env.SHIPPO_ORIGIN_ZIP?.trim() ?? "",
    phone: env.SHIPPO_ORIGIN_PHONE?.trim() ?? "",
    email: env.SHIPPO_ORIGIN_EMAIL?.trim() ?? ""
  };
  const expectedTokenPrefix = values.testMode ? "shippo_test_" : "shippo_live_";
  if (
    !values.token.startsWith(expectedTokenPrefix) ||
    values.allowedCarriers.length === 0 ||
    [values.name, values.company, values.street1, values.city, values.state, values.zip, values.phone, values.email].some((value) => !value)
  ) {
    throw new ShippingUnavailableError("Shippo shipping is not fully configured for the selected environment.");
  }
  return {
    token: values.token,
    testMode: values.testMode,
    allowedCarriers: values.allowedCarriers,
    origin: {
      name: values.name,
      company: values.company,
      street1: values.street1,
      city: values.city,
      state: values.state,
      zip: values.zip,
      country: "US",
      phone: values.phone,
      email: values.email
    }
  };
}

async function shippoRequest<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  configuration: ShippingConfiguration,
  fetchImpl: typeof fetch
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(`${SHIPPO_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `ShippoToken ${configuration.token}`,
        "content-type": "application/json",
        ...init.headers
      },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new ShippingUnavailableError(`Shippo rate request failed (${response.status}).`);
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ShippingUnavailableError) throw error;
    throw new ShippingUnavailableError("Shippo rates are temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

function publicRate(
  rate: z.infer<typeof shippoRateSchema>,
  context: Omit<QuoteTokenPayload, "v" | "rateId" | "amountCents" | "carrier" | "serviceName">,
  configuration: ShippingConfiguration
) {
  const amountCents = moneyToCents(rate.amount);
  const payload: QuoteTokenPayload = {
    v: 2,
    rateId: rate.object_id,
    amountCents,
    carrier: rate.provider,
    serviceName: rate.servicelevel.name,
    ...context
  };
  return {
    rateId: rate.object_id,
    amountCents,
    currency: "USD" as const,
    carrier: rate.provider,
    serviceName: rate.servicelevel.name,
    estimatedDays: rate.estimated_days ?? null,
    durationTerms: rate.duration_terms ?? rate.servicelevel.terms ?? null,
    readyToShipDate: context.readyToShipDate,
    expiresAt: context.expiresAt,
    quoteToken: signQuoteToken(payload, configuration)
  };
}

function signQuoteToken(payload: QuoteTokenPayload, configuration: ShippingConfiguration) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${createHmac("sha256", configuration.token).update(encoded).digest("base64url")}`;
}

function verifyQuoteToken(value: string, configuration: ShippingConfiguration): QuoteTokenPayload {
  const [encoded, suppliedSignature, ...rest] = value.split(".");
  if (!encoded || !suppliedSignature || rest.length > 0) throw new ShippingUnavailableError("The shipping quote is invalid.");
  const expectedSignature = createHmac("sha256", configuration.token).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    throw new ShippingUnavailableError("The shipping quote is invalid.");
  }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
    throw new ShippingUnavailableError("The shipping quote is invalid.");
  }
  const payloadSchema = z.object({
    v: z.literal(2),
    rateId: z.string().min(1),
    amountCents: z.number().int().positive(),
    carrier: z.string().min(1),
    serviceName: z.string().min(1),
    expiresAt: z.string().datetime(),
    addressHash: z.string().length(64),
    cartHash: z.string().length(64),
    packageHash: z.string().length(64),
    locationId: z.string().min(1),
    readyToShipDate: z.string().date(),
    policyVersion: z.string().min(1)
  });
  try {
    return payloadSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  } catch {
    throw new ShippingUnavailableError("The shipping quote is invalid.");
  }
}

function normalizedAddress(address: ShippingAddress) {
  return JSON.stringify({
    line1: address.line1.trim().toUpperCase(),
    line2: address.line2?.trim().toUpperCase() ?? "",
    city: address.city.trim().toUpperCase(),
    state: address.state.trim().toUpperCase(),
    postalCode: address.postalCode.trim(),
    country: address.country
  });
}

function normalizedCart(items: Array<{ squareVariationId: string; quantity: number }>) {
  return JSON.stringify([...items]
    .map((item) => ({ squareVariationId: item.squareVariationId.trim(), quantity: item.quantity }))
    .sort((left, right) => left.squareVariationId.localeCompare(right.squareVariationId)));
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function moneyToCents(value: string) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(cents)) {
    throw new ShippingUnavailableError("Shippo returned an invalid rate.");
  }
  return cents;
}

function consolidateShippingParcel(packageSnapshot: PackageSnapshotLine[]) {
  const length = Math.max(...packageSnapshot.map((item) => packageDecimalToThousandths(item.length)));
  const width = Math.max(...packageSnapshot.map((item) => packageDecimalToThousandths(item.width)));
  const height = packageSnapshot.reduce(
    (total, item) => total + packageDecimalToThousandths(item.height) * item.quantity,
    0
  );
  const weight = packageSnapshot.reduce(
    (total, item) => total + packageDecimalToThousandths(item.weight) * item.quantity,
    0
  );

  return {
    length: formatThousandths(length),
    width: formatThousandths(width),
    height: formatThousandths(height),
    distance_unit: "in" as const,
    weight: formatThousandths(weight),
    mass_unit: "lb" as const
  };
}

function packageDecimalToThousandths(value: string) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new ShippingUnavailableError("A product has invalid shipping package metadata.");
  const thousandths = Number(match[1]) * 1_000 + Number((match[2] ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(thousandths) || thousandths <= 0) {
    throw new ShippingUnavailableError("A product has invalid shipping package metadata.");
  }
  return thousandths;
}

function formatThousandths(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ShippingUnavailableError("The consolidated shipping package is invalid.");
  }
  const whole = Math.floor(value / 1_000);
  const fraction = String(value % 1_000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function positiveDecimal(value: string) {
  return /^\d+(?:\.\d{1,3})?$/.test(value) && Number(value) > 0;
}

function csv(value: string | undefined, lowercase = true) {
  return [...new Set((value ?? "").split(",")
    .map((entry) => lowercase ? entry.trim().toLowerCase() : entry.trim())
    .filter(Boolean))];
}
