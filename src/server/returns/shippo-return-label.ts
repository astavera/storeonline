/**
 * Quotes, purchases, and privately retrieves Shippo return labels. All Shippo
 * calls and tokens remain server-only.
 */

import "server-only";

import { z } from "zod";
import { env } from "@/lib/validation/env";
import type { EvaluatedReturnLine, VerifiedOrderSnapshot } from "@/server/returns/return-policy";

const SHIPPO_API_BASE_URL = "https://api.goshippo.com";
const requestTimeoutMs = 15_000;
const quoteTtlMs = 15 * 60_000;
const labelUseDays = 7;

const carrierAccountSchema = z.object({
  object_id: z.string().min(1),
  carrier: z.string().min(1),
  active: z.boolean()
}).passthrough();

const rateSchema = z.object({
  object_id: z.string().min(1),
  amount: z.string().regex(/^\d+(?:\.\d{1,4})?$/),
  currency: z.string().length(3),
  provider: z.string().min(1),
  servicelevel: z.object({
    name: z.string().min(1),
    token: z.string().min(1)
  }).passthrough()
}).passthrough();

const shipmentSchema = z.object({
  object_id: z.string().min(1),
  status: z.string().min(1),
  rates: z.array(rateSchema)
}).passthrough();

const transactionSchema = z.object({
  object_id: z.string().min(1),
  status: z.enum(["WAITING", "QUEUED", "SUCCESS", "ERROR", "REFUNDED", "REFUNDPENDING", "REFUNDREJECTED"]),
  label_url: z.string().url().nullable().optional(),
  tracking_number: z.string().nullable().optional(),
  tracking_url_provider: z.string().url().nullable().optional(),
  test: z.boolean().optional(),
  was_test: z.boolean().optional(),
  rate: z.union([rateSchema, z.string()]),
  messages: z.array(z.unknown()).optional()
}).passthrough();

type ReturnShippoConfiguration = {
  token: string;
  testMode: boolean;
  allowedCarriers: string[];
  defaultService: string;
  wh01: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
};

export type ReturnLabelQuote = {
  shipmentId: string;
  rateId: string;
  amountCents: number;
  currency: string;
  carrier: string;
  serviceLevel: string;
  serviceToken: string;
  expiresAt: string;
};

export type PurchasedReturnLabel = ReturnLabelQuote & {
  transactionId: string;
  trackingNumber: string;
  privateLabelUrl: string;
  labelExpiresAt: Date;
};

export async function quoteReturnLabel(input: {
  order: VerifiedOrderSnapshot;
  lines: EvaluatedReturnLine[];
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ReturnLabelQuote> {
  const configuration = getReturnShippoConfiguration();
  const parcel = calculateReturnParcel(input.lines);
  const carrierAccounts = await shippoRequest(
    "/carrier_accounts?service_levels=true&results=100",
    { method: "GET" },
    z.union([
      z.array(carrierAccountSchema),
      z.object({ results: z.array(carrierAccountSchema) }).transform((value) => value.results)
    ]),
    configuration,
    input.fetchImpl ?? fetch
  );
  const allowedAccounts = carrierAccounts
    .filter((account) =>
      account.active && configuration.allowedCarriers.includes(account.carrier.toLowerCase())
    )
    .map((account) => account.object_id);
  if (allowedAccounts.length === 0) {
    throw new ReturnLabelError("NO_ALLOWED_RETURN_CARRIER");
  }

  const shipment = await shippoRequest(
    "/shipments/",
    {
      method: "POST",
      body: JSON.stringify({
        address_from: {
          name: input.order.returnAddress.name,
          street1: input.order.returnAddress.line1,
          ...(input.order.returnAddress.line2 ? { street2: input.order.returnAddress.line2 } : {}),
          city: input.order.returnAddress.city,
          state: input.order.returnAddress.state,
          zip: input.order.returnAddress.postalCode,
          country: input.order.returnAddress.country
        },
        address_to: configuration.wh01,
        parcels: [parcel],
        carrier_accounts: allowedAccounts,
        extra: { is_return: true },
        metadata: "Modern State return to WH01",
        async: false
      })
    },
    shipmentSchema,
    configuration,
    input.fetchImpl ?? fetch
  );

  const exactServiceRates = shipment.rates.filter((rate) =>
    rate.servicelevel.token.toLowerCase() === configuration.defaultService.toLowerCase() &&
    configuration.allowedCarriers.includes(rate.provider.toLowerCase())
  );
  const selected = exactServiceRates.sort((left, right) =>
    moneyToCents(left.amount) - moneyToCents(right.amount)
  )[0];
  if (!selected) throw new ReturnLabelError("CONFIGURED_RETURN_SERVICE_UNAVAILABLE");
  if (selected.currency.toUpperCase() !== "USD") throw new ReturnLabelError("SHIPPO_RATE_CURRENCY_INVALID");
  const now = input.now ?? new Date();
  return {
    shipmentId: shipment.object_id,
    rateId: selected.object_id,
    amountCents: moneyToCents(selected.amount),
    currency: selected.currency,
    carrier: selected.provider,
    serviceLevel: selected.servicelevel.name,
    serviceToken: selected.servicelevel.token,
    expiresAt: new Date(now.getTime() + quoteTtlMs).toISOString()
  };
}

export async function purchaseReturnLabel(input: {
  quote: ReturnLabelQuote;
  rmaNumber: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<PurchasedReturnLabel> {
  if (Date.parse(input.quote.expiresAt) <= (input.now ?? new Date()).getTime()) {
    throw new ReturnLabelError("RETURN_RATE_EXPIRED");
  }
  const configuration = getReturnShippoConfiguration();
  const transaction = await shippoRequest(
    "/transactions/",
    {
      method: "POST",
      body: JSON.stringify({
        rate: input.quote.rateId,
        async: false,
        label_file_type: "PDF",
        metadata: `RMA ${input.rmaNumber}`.slice(0, 100)
      })
    },
    transactionSchema,
    configuration,
    input.fetchImpl ?? fetch
  );
  if (
    transaction.status !== "SUCCESS" ||
    !transaction.label_url ||
    !transaction.tracking_number ||
    (configuration.testMode && transaction.test !== true && transaction.was_test !== true) ||
    (!configuration.testMode && (transaction.test === true || transaction.was_test === true))
  ) {
    throw new ReturnLabelError("SHIPPO_LABEL_NOT_CREATED");
  }
  assertPrivateLabelUrl(transaction.label_url);
  const now = input.now ?? new Date();
  return {
    ...input.quote,
    transactionId: transaction.object_id,
    trackingNumber: transaction.tracking_number,
    privateLabelUrl: transaction.label_url,
    labelExpiresAt: new Date(now.getTime() + labelUseDays * 86_400_000)
  };
}

export async function validateReturnLabelQuote(input: {
  quote: ReturnLabelQuote;
  fetchImpl?: typeof fetch;
  now?: Date;
}) {
  if (Date.parse(input.quote.expiresAt) <= (input.now ?? new Date()).getTime()) {
    throw new ReturnLabelError("RETURN_RATE_EXPIRED");
  }
  const configuration = getReturnShippoConfiguration();
  const rate = await shippoRequest(
    `/rates/${encodeURIComponent(input.quote.rateId)}`,
    { method: "GET" },
    rateSchema,
    configuration,
    input.fetchImpl ?? fetch
  );
  if (
    rate.object_id !== input.quote.rateId ||
    moneyToCents(rate.amount) !== input.quote.amountCents ||
    rate.currency !== input.quote.currency ||
    rate.provider !== input.quote.carrier ||
    rate.servicelevel.name !== input.quote.serviceLevel ||
    rate.servicelevel.token !== input.quote.serviceToken ||
    !configuration.allowedCarriers.includes(rate.provider.toLowerCase()) ||
    rate.servicelevel.token.toLowerCase() !== configuration.defaultService.toLowerCase()
  ) {
    throw new ReturnLabelError("RETURN_RATE_CHANGED");
  }
  return input.quote;
}

export async function downloadReturnLabel(input: {
  transactionId: string;
  fetchImpl?: typeof fetch;
}) {
  const configuration = getReturnShippoConfiguration();
  const fetchImpl = input.fetchImpl ?? fetch;
  const transaction = await shippoRequest(
    `/transactions/${encodeURIComponent(input.transactionId)}`,
    { method: "GET" },
    transactionSchema,
    configuration,
    fetchImpl
  );
  if (transaction.status !== "SUCCESS" || !transaction.label_url) {
    throw new ReturnLabelError("SHIPPO_LABEL_NOT_AVAILABLE");
  }
  const labelUrl = assertPrivateLabelUrl(transaction.label_url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(labelUrl, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    if (!response.ok) throw new ReturnLabelError("SHIPPO_LABEL_DOWNLOAD_FAILED");
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024) {
      throw new ReturnLabelError("SHIPPO_LABEL_TOO_LARGE");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new ReturnLabelError("SHIPPO_LABEL_TOO_LARGE");
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") throw new ReturnLabelError("SHIPPO_LABEL_INVALID");
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

export function calculateReturnParcel(lines: EvaluatedReturnLine[]) {
  const selected = lines.filter((line) => line.decision === "ELIGIBLE");
  if (selected.length === 0) throw new ReturnLabelError("NO_AUTHORIZED_RETURN_LINES");
  if (selected.some((line) => !line.line.package)) {
    throw new ReturnLabelError("RETURN_PACKAGE_DATA_MISSING");
  }
  const packages = selected.flatMap((line) =>
    Array.from({ length: line.selection.quantity }, () => line.line.package!)
  );
  const length = Math.max(...packages.map((parcel) => parcel.lengthIn));
  const width = Math.max(...packages.map((parcel) => parcel.widthIn));
  const height = packages.reduce((total, parcel) => total + parcel.heightIn, 0);
  const weight = packages.reduce((total, parcel) => total + parcel.weightLb, 0);
  if (![length, width, height, weight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new ReturnLabelError("RETURN_PACKAGE_DATA_MISSING");
  }
  return {
    length: length.toFixed(2),
    width: width.toFixed(2),
    height: height.toFixed(2),
    distance_unit: "in",
    weight: weight.toFixed(2),
    mass_unit: "lb"
  };
}

function getReturnShippoConfiguration(): ReturnShippoConfiguration {
  const token = env.SHIPPO_API_TOKEN?.trim() ?? "";
  const testMode = env.SHIPPO_TEST_MODE === "true";
  const allowedCarriers = csv(env.SHIPPO_ALLOWED_RETURN_CARRIERS);
  const defaultService = env.SHIPPO_DEFAULT_RETURN_SERVICE?.trim() ?? "";
  const country = env.SHIPPO_RETURN_ADDRESS_COUNTRY?.trim().toUpperCase() ?? "";
  const wh01 = {
    name: env.SHIPPO_RETURN_ADDRESS_NAME?.trim() ?? "",
    street1: env.SHIPPO_RETURN_ADDRESS_LINE1?.trim() ?? "",
    ...(env.SHIPPO_RETURN_ADDRESS_LINE2?.trim()
      ? { street2: env.SHIPPO_RETURN_ADDRESS_LINE2.trim() }
      : {}),
    city: env.SHIPPO_RETURN_ADDRESS_CITY?.trim() ?? "",
    state: env.SHIPPO_RETURN_ADDRESS_STATE?.trim().toUpperCase() ?? "",
    zip: env.SHIPPO_RETURN_ADDRESS_ZIP?.trim() ?? "",
    country
  };
  const expectedPrefix = testMode ? "shippo_test_" : "shippo_live_";
  if (
    !token.startsWith(expectedPrefix) ||
    allowedCarriers.length === 0 ||
    !defaultService ||
    Object.values(wh01).some((value) => !value) ||
    country !== "US"
  ) {
    throw new ReturnLabelError("SHIPPO_RETURNS_NOT_CONFIGURED");
  }
  return { token, testMode, allowedCarriers, defaultService, wh01 };
}

async function shippoRequest<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  configuration: ReturnShippoConfiguration,
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
        "SHIPPO-API-VERSION": "2018-02-08",
        ...init.headers
      },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new ReturnLabelError(`SHIPPO_HTTP_${response.status}`);
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ReturnLabelError) throw error;
    throw new ReturnLabelError("SHIPPO_RETURNS_UNAVAILABLE", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function assertPrivateLabelUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "shippo-delivery.s3.amazonaws.com" ||
      /^shippo-delivery\.s3\.[a-z0-9-]+\.amazonaws\.com$/i.test(url.hostname)
    )
  ) {
    throw new ReturnLabelError("SHIPPO_LABEL_URL_REJECTED");
  }
  return url.toString();
}

function moneyToCents(value: string) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents)) {
    throw new ReturnLabelError("SHIPPO_RATE_INVALID");
  }
  return cents;
}

function csv(value: string | undefined) {
  return [...new Set((value ?? "").split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean))];
}

export class ReturnLabelError extends Error {
  readonly code: string;

  constructor(code: string, options?: { cause?: unknown }) {
    super("A return label could not be created.", options);
    this.name = "ReturnLabelError";
    this.code = code;
  }
}
