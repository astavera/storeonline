/** Verifies Stripe Tax form encoding and cent-for-cent reconciliation without live calls. */

import { describe, expect, it, vi } from "vitest";
import {
  createConfiguredShippingTaxService,
  createStripeTaxClient,
  resolveStripeTaxConfiguration,
  type TaxCalculationInput
} from "@/server/tax";

const configuredEnvironment = {
  DESTINATION_TAX_ENABLED: "true",
  SQUARE_ENVIRONMENT: "sandbox",
  STRIPE_TAX_SECRET_KEY: "sk_test_not_a_real_secret_key_123456",
  STRIPE_TAX_SHIPPING_CODE: "txcd_92010001"
};

const input: TaxCalculationInput = {
  fulfillmentType: "SHIPPING",
  currency: "USD",
  origin: { line1: "153 S Dean St", city: "Englewood", state: "NJ", postalCode: "07631", country: "US" },
  destination: { line1: "500 E 80th St", city: "New York", state: "NY", postalCode: "10075", country: "US" },
  shippingCents: 600,
  lines: [
    {
      id: "variation-a",
      quantity: 2,
      unitPriceCents: 1_000,
      discountCents: 100,
      taxability: { kind: "PRODUCT_TAX_CODE", code: "txcd_99999999" }
    },
    {
      id: "variation-b",
      quantity: 1,
      unitPriceCents: 500,
      discountCents: 0,
      taxability: { kind: "PRODUCT_TAX_CODE", code: "txcd_00000000" }
    }
  ]
};

function breakdown(amount: number, taxableAmount: number, reason = "standard_rated") {
  return {
    amount,
    jurisdiction: { country: "US", state: "NY", level: "state", display_name: "New York" },
    sourcing: "destination",
    tax_rate_details: reason === "not_collecting" || reason === "product_exempt"
      ? null
      : { percentage_decimal: "8.875", tax_type: "sales_tax" },
    taxability_reason: reason,
    taxable_amount: taxableAmount
  };
}

const collectResponse = {
  id: "taxcalc_test_collect_123",
  object: "tax.calculation",
  amount_total: 3_222,
  currency: "usd",
  expires_at: 1_800_000_000,
  livemode: false,
  line_items: {
    object: "list",
    has_more: false,
    data: [
      {
        amount: 1_900,
        amount_tax: 169,
        reference: "variation-a",
        quantity: 2,
        tax_behavior: "exclusive",
        tax_code: "txcd_99999999",
        tax_breakdown: [breakdown(169, 1_900)]
      },
      {
        amount: 500,
        amount_tax: 0,
        reference: "variation-b",
        quantity: 1,
        tax_behavior: "exclusive",
        tax_code: "txcd_00000000",
        tax_breakdown: [breakdown(0, 0, "product_exempt")]
      }
    ]
  },
  shipping_cost: {
    amount: 600,
    amount_tax: 53,
    tax_behavior: "exclusive",
    tax_code: "txcd_92010001",
    tax_breakdown: [breakdown(53, 600)]
  },
  tax_amount_exclusive: 222,
  tax_amount_inclusive: 0,
  tax_breakdown: [{
    amount: 222,
    inclusive: false,
    taxable_amount: 2_500,
    tax_rate_details: { country: "US", state: "NY", percentage_decimal: "8.875", tax_type: "sales_tax" }
  }]
};

describe("Stripe Tax shipping provider", () => {
  it("sends integer cents and reconciles merchandise and shipping", async () => {
    const fakeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("currency")).toBe("usd");
      expect(form.get("customer_details[address][state]")).toBe("NY");
      expect(form.get("ship_from_details[address][state]")).toBe("NJ");
      expect(form.get("line_items[0][amount]")).toBe("1900");
      expect(form.get("line_items[0][tax_code]")).toBe("txcd_99999999");
      expect(form.get("shipping_cost[amount]")).toBe("600");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${configuredEnvironment.STRIPE_TAX_SECRET_KEY}`
      );
      return Response.json(collectResponse);
    });
    const result = await createConfiguredShippingTaxService({
      environment: configuredEnvironment,
      fetchImpl: fakeFetch as typeof fetch
    }).calculateShippingTax(input);

    expect(result).toMatchObject({
      provider: "stripe_tax",
      providerQuoteId: "taxcalc_test_collect_123",
      nexusDecision: "COLLECT",
      taxSource: "destination",
      subtotalCents: 2_400,
      shippingCents: 600,
      taxableMerchandiseCents: 1_900,
      taxableShippingCents: 600,
      merchandiseTaxCents: 169,
      shippingTaxCents: 53,
      totalTaxCents: 222,
      totalCents: 3_222
    });
  });

  it("returns no collection when potentially taxable components report not_collecting", async () => {
    const noCollection = {
      ...collectResponse,
      id: "taxcalc_test_no_collection_123",
      amount_total: 3_000,
      line_items: {
        ...collectResponse.line_items,
        data: collectResponse.line_items.data.map((line) => ({
          ...line,
          amount_tax: 0,
          tax_breakdown: [breakdown(0, 0, "not_collecting")]
        }))
      },
      shipping_cost: {
        ...collectResponse.shipping_cost,
        amount_tax: 0,
        tax_breakdown: [breakdown(0, 0, "not_collecting")]
      },
      tax_amount_exclusive: 0,
      tax_breakdown: []
    };
    const result = await createConfiguredShippingTaxService({
      environment: configuredEnvironment,
      fetchImpl: vi.fn(async () => Response.json(noCollection)) as typeof fetch
    }).calculateShippingTax(input);
    expect(result).toMatchObject({ nexusDecision: "DO_NOT_COLLECT", taxSource: null, totalTaxCents: 0 });
  });

  it("fails closed for unsupported taxability and mismatched totals", async () => {
    const fakeFetch = vi.fn();
    const service = createConfiguredShippingTaxService({
      environment: configuredEnvironment,
      fetchImpl: fakeFetch as typeof fetch
    });
    await expect(service.calculateShippingTax({
      ...input,
      lines: [{ ...input.lines[0], taxability: { kind: "FULLY_TAXABLE" } }]
    })).rejects.toMatchObject({ code: "TAX_UNSUPPORTED_TAXABILITY" });
    expect(fakeFetch).not.toHaveBeenCalled();

    const mismatched = createConfiguredShippingTaxService({
      environment: configuredEnvironment,
      fetchImpl: vi.fn(async () => Response.json({ ...collectResponse, amount_total: 3_223 })) as typeof fetch
    });
    await expect(mismatched.calculateShippingTax(input)).rejects.toMatchObject({
      code: "TAX_PROVIDER_RECONCILIATION_FAILED"
    });
  });

  it("rejects mixed Square and Stripe environments", () => {
    expect(() => createConfiguredShippingTaxService({
      environment: { ...configuredEnvironment, SQUARE_ENVIRONMENT: "production" }
    })).toThrowError(expect.objectContaining({ code: "TAX_PROVIDER_NOT_CONFIGURED" }));
  });

  it("reports an external Square sale with a stable Stripe idempotency key", async () => {
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url).endsWith("/tax/transactions/create_from_calculation")).toBe(true);
      expect(new Headers(init?.headers).get("idempotency-key")).toBe("square-tax-square-order-123");
      expect(new URLSearchParams(String(init?.body)).get("calculation")).toBe("taxcalc_test_collect_123");
      return Response.json({
        id: "tax_transaction_test_123",
        object: "tax.transaction",
        currency: "usd",
        livemode: false,
        reference: "square-order-123"
      });
    });
    const client = createStripeTaxClient({
      configuration: resolveStripeTaxConfiguration(configuredEnvironment),
      fetchImpl: fakeFetch as typeof fetch
    });
    await expect(client.createTransactionFromCalculation({
      calculationId: "taxcalc_test_collect_123",
      reference: "square-order-123",
      postedAt: 1_700_000_000
    })).resolves.toEqual({
      id: "tax_transaction_test_123",
      reference: "square-order-123",
      livemode: false
    });
  });
});
