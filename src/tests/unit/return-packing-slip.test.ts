/**
 * Verifies the private return packing slip and optionally writes the same
 * fixture for render-based visual QA.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReturnPackingSlipPdf } from "@/server/returns/return-packing-slip";
import type { ReturnRequestRecord } from "@/server/returns/return-repository";

describe("return packing slip", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("contains a valid PDF, RMA barcode text, authorized items, and WH01 notice", () => {
    vi.stubEnv("SHIPPO_RETURN_ADDRESS_NAME", "Modern State Returns");
    vi.stubEnv("SHIPPO_RETURN_ADDRESS_LINE1", "401 East 86th Street");
    vi.stubEnv("SHIPPO_RETURN_ADDRESS_CITY", "New York");
    vi.stubEnv("SHIPPO_RETURN_ADDRESS_STATE", "NY");
    vi.stubEnv("SHIPPO_RETURN_ADDRESS_ZIP", "10028");
    vi.stubEnv("SHIPPO_RETURN_ADDRESS_COUNTRY", "US");
    const pdf = createReturnPackingSlipPdf(fixture());
    const printable = pdf.toString("binary");

    expect(printable.startsWith("%PDF-1.4")).toBe(true);
    expect(printable).toContain("RMA-4001");
    expect(printable).toContain("MS-4001");
    expect(printable).toContain("Returnable item");
    expect(printable).toContain("Refunds are issued only after WH01 receives and inspects");
    expect(printable.endsWith("%%EOF")).toBe(true);

    const output = process.env.RETURN_PDF_QA_OUTPUT?.trim();
    if (output) {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, pdf);
    }
  });
});

function fixture(): ReturnRequestRecord {
  const timestamp = new Date("2026-07-30T16:00:00.000Z");
  return {
    id: "return-4001",
    rmaNumber: "RMA-4001",
    orderProRmaId: "orderpro-rma-4001",
    verificationSessionId: "return-session-4001",
    idempotencyKey: "packing-slip-fixture-4001",
    requestHash: "a".repeat(64),
    orderProOrderId: "orderpro-order-4001",
    orderNumber: "MS-4001",
    status: "LABEL_CREATED",
    policyVersion: "2026-07-30",
    businessTimeZone: "America/New_York",
    currency: "USD",
    labelPayer: "CUSTOMER",
    acceptedLabelDeductionCents: 725,
    merchandiseRefundCents: 1_800,
    estimatedTaxRefundCents: 177,
    discountAdjustmentCents: 200,
    refundableOriginalFeesCents: 0,
    originalShippingCents: 900,
    originalLocalDeliveryCents: 0,
    estimatedNetRefundCents: 1_252,
    shippoShipmentId: "shippo-shipment-4001",
    shippoRateId: "shippo-rate-4001",
    shippoTransactionId: "shippo-transaction-4001",
    shippoCarrier: "USPS",
    shippoServiceLevel: "Ground Advantage",
    trackingNumber: "9400100000000000000000",
    labelCostCents: 725,
    labelCurrency: "USD",
    privateLabelUrl: "https://shippo-delivery.s3.amazonaws.com/return.pdf",
    labelExpiresAt: new Date("2026-08-06T16:00:00.000Z"),
    squarePaymentId: "square-payment-4001",
    squareRefundId: null,
    squareRefundAmountCents: null,
    squareRefundCurrency: null,
    squareRefundStatus: null,
    finalApprovedRefundCents: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: [{
      orderLineId: "line-1",
      name: "Returnable item",
      variant: "Blue",
      sku: "SKU-4001",
      upc: "123456789012",
      quantity: 1,
      reason: "CHANGED_MIND",
      decision: "ELIGIBLE",
      decisionReason: "Eligible, subject to warehouse inspection.",
      merchandiseRefundCents: 1_800,
      estimatedTaxRefundCents: 177
    }],
    events: [{
      status: "LABEL_CREATED",
      source: "storefront",
      occurredAt: timestamp
    }]
  };
}
