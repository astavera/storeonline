/**
 * Verifies immutable label deductions, idempotent RMA retries, and label failure
 * recovery across the returns orchestration boundary.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReturnLineSelection } from "@/features/returns/contracts";
import { getOrderProReturnsClient } from "@/server/orderpro/returns-client";
import { InMemoryReturnsRepository } from "@/server/returns/return-repository";
import { createReturnsService } from "@/server/returns/return-service";
import {
  quoteReturnLabel,
  purchaseReturnLabel,
  ReturnLabelError,
  type ReturnLabelQuote
} from "@/server/returns/shippo-return-label";
import type { VerifiedOrderSnapshot } from "@/server/returns/return-policy";

const fixedNow = new Date("2026-07-30T16:00:00.000Z");
const labelQuote: ReturnLabelQuote = {
  shipmentId: "shippo-shipment-1",
  rateId: "shippo-rate-1",
  amountCents: 725,
  currency: "USD",
  carrier: "USPS",
  serviceLevel: "Ground Advantage",
  serviceToken: "usps_ground_advantage",
  expiresAt: "2026-07-30T16:15:00.000Z"
};

describe("returns service", () => {
  beforeEach(() => {
    vi.stubEnv("RETURNS_SESSION_SECRET", "test-return-session-secret-that-is-at-least-32-bytes");
    vi.stubEnv("RETURNS_BUSINESS_TIME_ZONE", "America/New_York");
  });

  it("uses the real customer-paid label quote as an immutable refund deduction", async () => {
    const setup = await serviceSetup({ reason: "CHANGED_MIND" });
    const result = await setup.service.quote({
      sessionToken: setup.session.publicToken,
      selections: [setup.selection]
    });

    expect(result.view).toMatchObject({
      labelPayer: "CUSTOMER",
      labelCostCents: 725,
      labelDeductionCents: 725,
      originalShippingCents: 900,
      originalLocalDeliveryCents: 300,
      refundableOriginalFeesCents: 0,
      estimatedNetRefundCents: 1_252,
      canSubmit: true
    });
  });

  it("makes an approved company-error label free and restores eligible original fees", async () => {
    const setup = await serviceSetup({ reason: "WRONG_VARIANT_SHIPPED" });
    const result = await setup.service.quote({
      sessionToken: setup.session.publicToken,
      selections: [setup.selection]
    });

    expect(result.view).toMatchObject({
      labelPayer: "COMPANY",
      labelCostCents: 725,
      labelDeductionCents: 0,
      refundableOriginalFeesCents: 1_200,
      estimatedNetRefundCents: 3_177
    });
  });

  it("does not duplicate an RMA or label purchase when the same request is retried", async () => {
    const purchase = vi.fn<typeof purchaseReturnLabel>().mockRejectedValue(
      new ReturnLabelError("SHIPPO_LABEL_NOT_CREATED")
    );
    const setup = await serviceSetup({ reason: "CHANGED_MIND", purchase });
    const quote = await setup.service.quote({
      sessionToken: setup.session.publicToken,
      selections: [setup.selection]
    });
    const input = {
      sessionToken: setup.session.publicToken,
      quoteToken: quote.view.quoteToken,
      selections: [setup.selection],
      idempotencyKey: "return-request-key-0001",
      policyAccepted: true,
      conditionAccepted: true,
      labelDeductionAccepted: true
    };

    const first = await setup.service.createRequest(input);
    const replay = await setup.service.createRequest(input);

    expect(first.replayed).toBe(false);
    expect(first.request.status).toBe("LABEL_PENDING");
    expect(replay.replayed).toBe(true);
    expect(replay.request.rmaNumber).toBe(first.request.rmaNumber);
    expect(purchase).toHaveBeenCalledOnce();
  });

  it("blocks a customer-paid request when package data prevents an exact rate", async () => {
    const setup = await serviceSetup({
      reason: "CHANGED_MIND",
      quote: vi.fn<typeof quoteReturnLabel>().mockRejectedValue(
        new ReturnLabelError("RETURN_PACKAGE_DATA_MISSING")
      )
    });
    const result = await setup.service.quote({
      sessionToken: setup.session.publicToken,
      selections: [setup.selection]
    });

    expect(result.view.canSubmit).toBe(false);
    expect(result.view.labelCostCents).toBeNull();
    expect(result.view.blockingReasons.join(" ")).toContain("weight or dimensions");
  });

  it("creates a company-error RMA as LABEL_PENDING when package data needs review", async () => {
    const setup = await serviceSetup({
      reason: "WRONG_VARIANT_SHIPPED",
      quote: vi.fn<typeof quoteReturnLabel>().mockRejectedValue(
        new ReturnLabelError("RETURN_PACKAGE_DATA_MISSING")
      )
    });
    const quote = await setup.service.quote({
      sessionToken: setup.session.publicToken,
      selections: [setup.selection]
    });

    expect(quote.view).toMatchObject({
      labelPayer: "COMPANY",
      labelCostCents: null,
      requiresManualReview: true,
      canSubmit: true
    });

    const created = await setup.service.createRequest({
      sessionToken: setup.session.publicToken,
      quoteToken: quote.view.quoteToken,
      selections: [setup.selection],
      idempotencyKey: "company-label-pending-0001",
      policyAccepted: true,
      conditionAccepted: true,
      labelDeductionAccepted: false
    });

    expect(created.request.status).toBe("LABEL_PENDING");
  });

  it("does not accept a REFUNDED status from OrderPRO without Square confirmation", async () => {
    const setup = await serviceSetup({ reason: "CHANGED_MIND" });
    const quote = await setup.service.quote({
      sessionToken: setup.session.publicToken,
      selections: [setup.selection]
    });
    const created = await setup.service.createRequest({
      sessionToken: setup.session.publicToken,
      quoteToken: quote.view.quoteToken,
      selections: [setup.selection],
      idempotencyKey: "square-status-boundary-0001",
      policyAccepted: true,
      conditionAccepted: true,
      labelDeductionAccepted: true
    });
    vi.mocked(setup.orderPro.getStatus).mockResolvedValue({
      ok: true,
      rma: {
        id: "orderpro-rma-1",
        rmaNumber: "RMA-1001",
        status: "REFUNDED",
        updatedAt: "2026-08-05T16:00:00.000Z",
        authorizedOrderLineIds: ["line-1"],
        reviewOrderLineIds: []
      }
    });

    const refreshed = await setup.service.getStatus({
      sessionToken: setup.session.publicToken,
      rmaNumber: created.request.rmaNumber
    });

    expect(refreshed.status).toBe("LABEL_CREATED");
  });
});

async function serviceSetup(input: {
  reason: ReturnLineSelection["reason"];
  quote?: typeof quoteReturnLabel;
  purchase?: typeof purchaseReturnLabel;
}) {
  const repository = new InMemoryReturnsRepository();
  const order = orderSnapshot();
  const selection = selectionFor(input.reason);
  const orderPro = {
    startVerification: vi.fn(),
    confirmVerification: vi.fn(),
    preview: vi.fn(async () => ({
      ok: true as const,
      evidenceDecisions: {
        "line-1": input.reason === "CHANGED_MIND" ? "NOT_REQUIRED" as const : "APPROVED" as const
      }
    })),
    createRma: vi.fn(async () => ({
      ok: true as const,
      replayed: false,
      rma: {
        id: "orderpro-rma-1",
        rmaNumber: "RMA-1001",
        status: "AUTHORIZED" as const,
        evidenceDecisions: {
          "line-1": input.reason === "CHANGED_MIND" ? "NOT_REQUIRED" as const : "APPROVED" as const
        },
        labelAuthorized: true,
        emailDispatched: true
      }
    })),
    getStatus: vi.fn(),
    uploadEvidence: vi.fn(),
    recordInventoryDisposition: vi.fn()
  } as unknown as NonNullable<ReturnType<typeof getOrderProReturnsClient>>;
  const service = createReturnsService({
    repository,
    orderPro,
    now: () => fixedNow,
    quoteLabel: input.quote ?? (vi.fn(async () => labelQuote) as unknown as typeof quoteReturnLabel),
    validateLabelQuote: vi.fn(async ({ quote }) => quote),
    purchaseLabel: input.purchase ?? (vi.fn(async () => ({
      ...labelQuote,
      transactionId: "shippo-transaction-1",
      trackingNumber: "9400100000000000000000",
      privateLabelUrl: "https://shippo-delivery.s3.amazonaws.com/return.pdf",
      labelExpiresAt: new Date("2026-08-06T16:00:00.000Z")
    })) as unknown as typeof purchaseReturnLabel)
  });
  const session = await repository.createVerifiedSession({
    orderReferenceHash: "a".repeat(64),
    emailHash: "b".repeat(64),
    postalCodeHash: "c".repeat(64),
    snapshot: order,
    now: fixedNow
  });
  return { repository, order, orderPro, selection, service, session };
}

function selectionFor(reason: ReturnLineSelection["reason"]): ReturnLineSelection {
  return {
    orderLineId: "line-1",
    quantity: 1,
    reason,
    comment: "",
    evidenceReferences: [],
    declaredUnused: true,
    declaredOriginalPackaging: true,
    declaredSealUnopened: true,
    partyOpened: false
  };
}

function orderSnapshot(): VerifiedOrderSnapshot {
  return {
    orderProOrderId: "orderpro-order-1",
    orderNumber: "MS-1001",
    squarePaymentId: "square-payment-1",
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
