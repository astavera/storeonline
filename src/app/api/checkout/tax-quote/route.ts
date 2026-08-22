/** Creates a short-lived, server-authoritative Stripe Tax quote for SHIPPING. */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/validation/env";
import { cartItemInputSchema } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  quoteShippingCart,
  shippingSelectionSchema,
  ShippingUnavailableError,
  validateShippingSelection
} from "@/server/shipping/shipping-service";
import { readPostgresProductTaxProfilesByVariationIds } from "@/server/square/postgres-catalog-store";
import {
  fingerprintShippingRate,
  fingerprintTaxAddress,
  fingerprintTaxCalculationResult,
  fingerprintTaxCart
} from "@/server/tax/tax-fingerprint";
import {
  buildTaxCalculationLines,
  TaxClassificationUnavailableError
} from "@/server/tax/merchandise-taxability";
import { resolveShippingTaxOrigin } from "@/server/tax/tax-origin-resolver";
import { TaxProviderError } from "@/server/tax/tax-provider";
import { getTaxQuoteRepository } from "@/server/tax/tax-quote-repository";
import { createConfiguredTaxQuoteTokenSigner } from "@/server/tax/tax-quote-token";
import { createConfiguredShippingTaxService } from "@/server/tax/tax-service";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  items: z.array(cartItemInputSchema.strict()).min(1).max(50),
  locationId: z.string().trim().min(1).max(160),
  shipping: shippingSelectionSchema
}).strict();

export async function POST(request: NextRequest) {
  try {
    if (env.DESTINATION_TAX_ENABLED !== "true") {
      throw new TaxProviderError("TAX_PROVIDER_DISABLED");
    }
    const taxService = createConfiguredShippingTaxService();
    const tokenSigner = createConfiguredTaxQuoteTokenSigner();
    const parsed = requestSchema.parse(await request.json());
    const quote = await quoteShippingCart({
      items: parsed.items,
      locationId: parsed.locationId
    });
    if (quote.errors.length > 0) throw new ShippingUnavailableError(quote.errors.join(" "));

    const shipping = await validateShippingSelection({
      items: parsed.items,
      locationId: parsed.locationId,
      selection: parsed.shipping
    });
    const profiles = await readPostgresProductTaxProfilesByVariationIds(
      quote.lines.map((line) => line.squareVariationId)
    );
    const lines = buildTaxCalculationLines(quote.lines, profiles);
    const origin = resolveShippingTaxOrigin();
    const calculation = {
      fulfillmentType: "SHIPPING" as const,
      currency: "USD" as const,
      origin: origin.address,
      destination: shipping.address,
      shippingCents: shipping.amountCents,
      lines
    };
    const result = await taxService.calculateShippingTax(calculation);
    const now = new Date();
    const expiresAt = new Date(Math.min(
      Date.parse(shipping.expiresAt),
      now.getTime() + 15 * 60_000
    ));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new ShippingUnavailableError("The shipping rate expired. Check rates again.");
    }

    const cartFingerprint = fingerprintTaxCart(lines);
    const destinationFingerprint = fingerprintTaxAddress(shipping.address);
    const shippingRateFingerprint = fingerprintShippingRate({
      rateId: shipping.rateId,
      amountCents: shipping.amountCents,
      currency: "USD",
      expiresAt: shipping.expiresAt
    });
    const calculationFingerprint = fingerprintTaxCalculationResult(result);
    const taxQuote = await getTaxQuoteRepository().create({
      calculation,
      result,
      cartFingerprint,
      originFingerprint: origin.fingerprint,
      destinationFingerprint,
      shippingRateFingerprint,
      calculationFingerprint,
      shippingRateId: shipping.rateId,
      expiresAt
    });
    const issuedAt = now.toISOString();
    const taxQuoteToken = tokenSigner.sign({
      v: 1,
      purpose: "shipping-tax-quote",
      taxQuoteId: taxQuote.id,
      provider: "stripe_tax",
      fulfillmentType: "SHIPPING",
      applicationMode: "EXPLICIT_DESTINATION_TAX",
      currency: "USD",
      nexusDecision: result.nexusDecision,
      taxSource: result.taxSource,
      cartFingerprint,
      originFingerprint: origin.fingerprint,
      destinationFingerprint,
      shippingRateFingerprint,
      calculationFingerprint,
      subtotalCents: result.subtotalCents,
      shippingCents: result.shippingCents,
      merchandiseTaxCents: result.merchandiseTaxCents,
      shippingTaxCents: result.shippingTaxCents,
      totalTaxCents: result.totalTaxCents,
      totalCents: result.totalCents,
      issuedAt,
      expiresAt: expiresAt.toISOString()
    });

    return NextResponse.json({
      ok: true,
      taxQuote: {
        id: taxQuote.id,
        token: taxQuoteToken,
        provider: result.provider,
        nexusDecision: result.nexusDecision,
        jurisdiction: result.jurisdiction,
        freightTaxable: result.freightTaxable,
        subtotalCents: result.subtotalCents,
        shippingCents: result.shippingCents,
        taxableMerchandiseCents: result.taxableMerchandiseCents,
        taxableShippingCents: result.taxableShippingCents,
        merchandiseTaxCents: result.merchandiseTaxCents,
        shippingTaxCents: result.shippingTaxCents,
        totalTaxCents: result.totalTaxCents,
        totalCents: result.totalCents,
        expiresAt: expiresAt.toISOString()
      }
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const status = error instanceof z.ZodError
      ? 400
      : error instanceof ShippingUnavailableError || error instanceof TaxClassificationUnavailableError
        ? 422
        : error instanceof TaxProviderError && !error.retryable && error.code === "TAX_UNSUPPORTED_TAXABILITY"
          ? 422
          : 503;
    const message = error instanceof TaxProviderError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Estimated tax is temporarily unavailable.";
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, errors: [error.message] }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { ok: false, errors: [message] },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
