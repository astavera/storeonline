/** Maps provider-neutral shipping inputs to Stripe Tax and reconciles every cent. */

import "server-only";

import {
  createStripeTaxClient,
  resolveStripeTaxConfiguration,
  type StripeTaxCalculationResponse,
  type StripeTaxClient,
  type StripeTaxConfiguration
} from "@/server/tax/stripe-tax-client";
import { safeAddCents, safeLineNetCents } from "@/server/tax/tax-money";
import { TaxProviderError, type TaxProvider } from "@/server/tax/tax-provider";
import {
  taxCalculationInputSchema,
  type TaxAddress,
  type TaxCalculationInput,
  type TaxCalculationLineResult,
  type TaxCalculationResult
} from "@/server/tax/tax-types";

export class StripeTaxProvider implements TaxProvider {
  readonly name = "stripe_tax" as const;

  constructor(
    private readonly client: StripeTaxClient,
    private readonly configuration: Pick<StripeTaxConfiguration, "shippingTaxCode">
  ) {}

  async calculate(rawInput: TaxCalculationInput): Promise<TaxCalculationResult> {
    const parsed = taxCalculationInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new TaxProviderError("TAX_INVALID_INPUT", null, { cause: parsed.error });
    const input = parsed.data;
    if (input.lines.some((line) => line.taxability.kind !== "PRODUCT_TAX_CODE")) {
      throw new TaxProviderError("TAX_UNSUPPORTED_TAXABILITY");
    }

    const lineAmounts = new Map(input.lines.map((line) => [
      line.id,
      safeLineNetCents(line.unitPriceCents, line.quantity, line.discountCents)
    ]));
    const subtotalCents = safeAddCents(...lineAmounts.values());
    const beforeTaxCents = safeAddCents(subtotalCents, input.shippingCents);
    const response = await this.client.createCalculation(buildStripeCalculationForm(
      input,
      lineAmounts,
      this.configuration.shippingTaxCode
    ));
    return reconcileStripeCalculation(input, response, lineAmounts, subtotalCents, beforeTaxCents);
  }
}

export function createConfiguredStripeTaxProvider(options?: {
  environment?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}) {
  const configuration = resolveStripeTaxConfiguration(options?.environment);
  return new StripeTaxProvider(
    createStripeTaxClient({ configuration, fetchImpl: options?.fetchImpl }),
    configuration
  );
}

export function buildStripeCalculationForm(
  input: TaxCalculationInput,
  lineAmounts: ReadonlyMap<string, number>,
  shippingTaxCode: string
) {
  const body = new URLSearchParams();
  body.set("currency", "usd");
  appendAddress(body, "customer_details[address]", input.destination);
  body.set("customer_details[address_source]", "shipping");
  appendAddress(body, "ship_from_details[address]", input.origin);
  input.lines.forEach((line, index) => {
    if (line.taxability.kind !== "PRODUCT_TAX_CODE") throw new TaxProviderError("TAX_UNSUPPORTED_TAXABILITY");
    body.set(`line_items[${index}][amount]`, String(lineAmounts.get(line.id)));
    body.set(`line_items[${index}][quantity]`, String(line.quantity));
    body.set(`line_items[${index}][reference]`, line.id);
    body.set(`line_items[${index}][tax_behavior]`, "exclusive");
    body.set(`line_items[${index}][tax_code]`, line.taxability.code);
  });
  body.set("shipping_cost[amount]", String(input.shippingCents));
  body.set("shipping_cost[tax_behavior]", "exclusive");
  body.set("shipping_cost[tax_code]", shippingTaxCode);
  body.append("expand[]", "line_items.data.tax_breakdown");
  body.append("expand[]", "shipping_cost.tax_breakdown");
  return body;
}

function appendAddress(body: URLSearchParams, prefix: string, address: TaxAddress) {
  body.set(`${prefix}[line1]`, address.line1);
  if (address.line2) body.set(`${prefix}[line2]`, address.line2);
  body.set(`${prefix}[city]`, address.city);
  body.set(`${prefix}[state]`, address.state);
  body.set(`${prefix}[postal_code]`, address.postalCode);
  body.set(`${prefix}[country]`, address.country);
}

function reconcileStripeCalculation(
  input: TaxCalculationInput,
  response: StripeTaxCalculationResponse,
  expectedAmounts: ReadonlyMap<string, number>,
  subtotalCents: number,
  beforeTaxCents: number
): TaxCalculationResult {
  if (response.line_items.has_more || response.tax_amount_inclusive !== 0) throw reconciliationError();
  if (response.line_items.data.length !== input.lines.length) throw reconciliationError();

  const inputById = new Map(input.lines.map((line) => [line.id, line]));
  const seen = new Set<string>();
  const lines: TaxCalculationLineResult[] = response.line_items.data.map((line) => {
    const expected = inputById.get(line.reference);
    const expectedAmount = expectedAmounts.get(line.reference);
    if (!expected || expectedAmount === undefined || seen.has(line.reference)) throw reconciliationError();
    seen.add(line.reference);
    if (
      expected.taxability.kind !== "PRODUCT_TAX_CODE" ||
      line.amount !== expectedAmount ||
      line.quantity !== expected.quantity ||
      line.tax_code !== expected.taxability.code
    ) throw reconciliationError();
    const breakdown = line.tax_breakdown ?? [];
    if (safeAddCents(...breakdown.map((part) => part.amount)) !== line.amount_tax) throw reconciliationError();
    return {
      id: line.reference,
      taxableCents: maximumTaxableAmount(breakdown, line.amount),
      taxCents: line.amount_tax,
      combinedRatePpm: effectiveRatePpm(line.amount, line.amount_tax)
    };
  });

  const shipping = response.shipping_cost;
  if (!shipping || shipping.amount !== input.shippingCents) throw reconciliationError();
  const shippingBreakdown = shipping.tax_breakdown ?? [];
  if (safeAddCents(...shippingBreakdown.map((part) => part.amount)) !== shipping.amount_tax) {
    throw reconciliationError();
  }
  const merchandiseTaxCents = safeAddCents(...lines.map((line) => line.taxCents));
  const totalTaxCents = safeAddCents(merchandiseTaxCents, shipping.amount_tax);
  if (
    totalTaxCents !== response.tax_amount_exclusive ||
    response.amount_total !== safeAddCents(beforeTaxCents, totalTaxCents) ||
    safeAddCents(...response.tax_breakdown.map((part) => part.amount)) !== totalTaxCents ||
    response.tax_breakdown.some((part) => part.inclusive)
  ) throw reconciliationError();

  const relevant = [
    ...response.line_items.data.flatMap((line) => line.tax_breakdown ?? []),
    ...shippingBreakdown
  ];
  const potentiallyTaxableParts = response.line_items.data.flatMap((line) => {
    const isNontaxableCode = line.tax_code === "txcd_00000000";
    return isNontaxableCode || line.amount === 0 ? [] : [line];
  });
  const shippingPotentiallyTaxable = shipping.tax_code !== "txcd_00000000" && shipping.amount > 0;
  const noCollection = (potentiallyTaxableParts.length > 0 || shippingPotentiallyTaxable)
    && relevant.length > 0
    && relevant.every((part) => part.taxability_reason === "not_collecting");
  const source = firstSourcing(relevant);
  const jurisdiction = firstUsJurisdiction(response, relevant);
  if (!noCollection && !source) throw reconciliationError();
  const taxSource = noCollection ? null : source ?? "destination";

  const taxableMerchandiseCents = safeAddCents(...lines.map((line) => line.taxableCents));
  const taxableShippingCents = maximumTaxableAmount(shippingBreakdown, shipping.amount);
  return {
    provider: "stripe_tax",
    providerQuoteId: response.id,
    fulfillmentType: "SHIPPING",
    applicationMode: "EXPLICIT_DESTINATION_TAX",
    currency: "USD",
    nexusDecision: noCollection ? "DO_NOT_COLLECT" : "COLLECT",
    taxSource,
    jurisdiction: noCollection ? null : jurisdiction,
    freightTaxable: taxableShippingCents > 0,
    subtotalCents,
    shippingCents: input.shippingCents,
    orderTotalBeforeTaxCents: beforeTaxCents,
    taxableMerchandiseCents,
    taxableShippingCents,
    merchandiseTaxCents,
    shippingTaxCents: shipping.amount_tax,
    totalTaxCents,
    totalCents: response.amount_total,
    combinedRatePpm: effectiveRatePpm(subtotalCents, merchandiseTaxCents),
    shippingCombinedRatePpm: effectiveRatePpm(shipping.amount, shipping.amount_tax),
    lines
  };
}

type StripeBreakdown = NonNullable<StripeTaxCalculationResponse["line_items"]["data"][number]["tax_breakdown"]>[number];

function maximumTaxableAmount(parts: readonly StripeBreakdown[], maximum: number) {
  const taxable = parts.reduce((largest, part) => Math.max(largest, part.taxable_amount), 0);
  if (taxable > maximum) throw reconciliationError();
  return taxable;
}

function firstSourcing(parts: readonly StripeBreakdown[]) {
  const imposed = parts.filter((part) => part.taxability_reason !== "not_collecting");
  const values = new Set((imposed.length > 0 ? imposed : parts).map((part) => part.sourcing));
  if (values.size > 1) throw reconciliationError();
  return values.values().next().value as "origin" | "destination" | undefined;
}

function firstUsJurisdiction(response: StripeTaxCalculationResponse, parts: readonly StripeBreakdown[]) {
  const state = response.tax_breakdown.find((part) => part.tax_rate_details.country === "US")?.tax_rate_details.state
    ?? parts.find((part) => part.jurisdiction.country === "US")?.jurisdiction.state
    ?? null;
  return state ? { country: "US" as const, state, county: null, city: null } : null;
}

function effectiveRatePpm(baseCents: number, taxCents: number) {
  if (baseCents === 0 || taxCents === 0) return 0;
  return Math.round((taxCents * 1_000_000) / baseCents);
}

function reconciliationError() {
  return new TaxProviderError("TAX_PROVIDER_RECONCILIATION_FAILED");
}
