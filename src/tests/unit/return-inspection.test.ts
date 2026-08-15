/**
 * Verifies post-inspection refund math, original-payment correlation, and
 * idempotent retries.
 */

import { describe, expect, it, vi } from "vitest";
import type { ReturnLineSelection } from "@/features/returns/contracts";
import { createReturnInspectionService } from "@/server/returns/return-inspection-service";
import { InMemoryReturnsRepository } from "@/server/returns/return-repository";
import { evaluateReturnPolicy, type VerifiedOrderSnapshot } from "@/server/returns/return-policy";

describe("return inspection and refund", () => {
  it("refunds only approved merchandise and tax to the original Square payment", async () => {
    const setup = await createRequest();
    const refund = vi.fn(async () => ({
      refundId: "square-refund-1",
      status: "COMPLETED",
      amountCents: 1_252,
      currency: "USD" as const
    }));
    const service = createReturnInspectionService({ repository: setup.repository, refund });
    const event = {
      eventId: "inspection-event-1001",
      orderProRmaId: "orderpro-rma-3001",
      inspectedAt: "2026-08-05T16:00:00.000Z",
      lines: [{
        orderLineId: "line-1",
        approvedQuantity: 1,
        disposition: "AVAILABLE_ONLINE" as const
      }]
    };

    const first = await service.process(event);
    const replay = await service.process(event);

    expect(first).toMatchObject({
      status: "REFUNDED",
      finalApprovedRefundCents: 1_252
    });
    expect(refund).toHaveBeenCalledWith({
      rmaNumber: "RMA-3001",
      paymentId: "square-original-payment-3001",
      amountCents: 1_252
    });
    expect(refund).toHaveBeenCalledOnce();
    expect(replay.replayed).toBe(true);
  });
});

async function createRequest() {
  const repository = new InMemoryReturnsRepository();
  const order = snapshot();
  const selection: ReturnLineSelection = {
    orderLineId: "line-1",
    quantity: 2,
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
  await repository.createRequest({
    verificationSessionId: session.id,
    idempotencyKey: "inspection-return-request-1",
    requestHash: "d".repeat(64),
    rmaNumber: "RMA-3001",
    orderProRmaId: "orderpro-rma-3001",
    order,
    evaluation,
    acceptedLabelDeductionCents: 725,
    estimatedNetRefundCents: 3_229,
    quoteSnapshot: {},
    acceptedAt: new Date("2026-07-30T16:00:00.000Z"),
    policyAccepted: true,
    conditionAccepted: true,
    labelDeductionAccepted: true
  });
  return { repository };
}

function snapshot(): VerifiedOrderSnapshot {
  return {
    orderProOrderId: "orderpro-order-3001",
    orderNumber: "MS-3001",
    squarePaymentId: "square-original-payment-3001",
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
      purchasedQuantity: 2,
      deliveredQuantity: 2,
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
