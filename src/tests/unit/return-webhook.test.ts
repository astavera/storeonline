/**
 * Verifies idempotent Shippo tracking and the strict boundary between carrier
 * delivery and warehouse receipt, inspection, or refund.
 */

import { describe, expect, it } from "vitest";
import type { ReturnLineSelection } from "@/features/returns/contracts";
import {
  InMemoryReturnsRepository,
  type ReturnsRepository
} from "@/server/returns/return-repository";
import { evaluateReturnPolicy, type VerifiedOrderSnapshot } from "@/server/returns/return-policy";
import { createShippoWebhookHandler } from "@/server/webhooks/shippo-webhook-handler";

describe("Shippo return tracking webhook", () => {
  it("applies repeated DELIVERED events once and never marks the RMA refunded", async () => {
    const setup = await requestWithTracking();
    const handler = createShippoWebhookHandler(setup.repository);
    const record = {
      id: "inbox-1",
      provider: "shippo",
      eventId: "shippo-event-1",
      eventType: "track_updated",
      payload: {
        event: "track_updated",
        data: {
          tracking_number: "9400100000000000000000",
          tracking_status: {
            status: "DELIVERED",
            status_date: "2026-08-03T16:00:00.000Z",
            status_details: "Delivered"
          }
        }
      },
      status: "PROCESSING" as const,
      attempts: 1,
      lockToken: "lease-1",
      duplicate: false
    };

    await handler(record);
    await handler(record);

    const saved = await setup.repository.findRequestByTrackingNumber("9400100000000000000000");
    expect(saved?.status).toBe("DELIVERED_TO_WH01");
    expect(saved?.events.filter((event) => event.source === "shippo")).toHaveLength(1);
    expect(saved?.squareRefundId).toBeNull();
  });
});

async function requestWithTracking() {
  const repository: ReturnsRepository = new InMemoryReturnsRepository();
  const order = snapshot();
  const selection: ReturnLineSelection = {
    orderLineId: "line-1",
    quantity: 1,
    reason: "CHANGED_MIND",
    comment: "",
    evidenceReferences: [],
    declaredUnused: true,
    declaredOriginalPackaging: true,
    declaredSealUnopened: true,
    partyOpened: false
  };
  const evaluation = evaluateReturnPolicy({
    order,
    selections: [selection],
    evidenceDecisions: { "line-1": "NOT_REQUIRED" },
    requestedAt: new Date("2026-07-30T16:00:00.000Z"),
    businessTimeZone: "America/New_York"
  });
  const session = await repository.createVerifiedSession({
    orderReferenceHash: "a".repeat(64),
    emailHash: "b".repeat(64),
    postalCodeHash: "c".repeat(64),
    snapshot: order
  });
  const created = await repository.createRequest({
    verificationSessionId: session.id,
    idempotencyKey: "webhook-return-request-1",
    requestHash: "d".repeat(64),
    rmaNumber: "RMA-2001",
    orderProRmaId: "orderpro-rma-2001",
    order,
    evaluation,
    acceptedLabelDeductionCents: 725,
    estimatedNetRefundCents: 1_252,
    quoteSnapshot: {},
    acceptedAt: new Date("2026-07-30T16:00:00.000Z"),
    policyAccepted: true,
    conditionAccepted: true,
    labelDeductionAccepted: true
  });
  await repository.updateLabel({
    id: created.record.id,
    status: "LABEL_CREATED",
    shippoShipmentId: "shippo-shipment-1",
    shippoRateId: "shippo-rate-1",
    shippoTransactionId: "shippo-transaction-1",
    shippoCarrier: "USPS",
    shippoServiceLevel: "Ground Advantage",
    trackingNumber: "9400100000000000000000",
    labelCostCents: 725,
    labelCurrency: "USD",
    privateLabelUrl: "https://shippo-delivery.s3.amazonaws.com/return.pdf",
    labelExpiresAt: new Date("2026-08-06T16:00:00.000Z")
  });
  return { repository };
}

function snapshot(): VerifiedOrderSnapshot {
  return {
    orderProOrderId: "orderpro-order-2",
    orderNumber: "MS-2001",
    squarePaymentId: "square-payment-original-2",
    currency: "USD",
    fulfillmentStatus: "DELIVERED",
    confirmedDeliveryAt: "2026-07-20T16:00:00.000Z",
    originalShippingCents: 900,
    originalLocalDeliveryCents: 300,
    returnAddress: {
      name: "Verified Customer",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10028",
      country: "US"
    },
    lines: [{
      orderLineId: "line-1",
      squareVariationId: "variation-1",
      name: "Returnable item",
      variant: "Blue",
      sku: "SKU-1",
      upc: "123456789012",
      imageUrl: null,
      purchasedQuantity: 1,
      deliveredQuantity: 1,
      previouslyReturnedQuantity: 0,
      unitMerchandiseCents: 2_000,
      unitTaxCents: 177,
      unitDiscountCents: 200,
      finalSale: false,
      brandReturnable: true,
      returnPolicyTags: [],
      package: { lengthIn: 10, widthIn: 8, heightIn: 4, weightLb: 1.5 }
    }]
  };
}
