/**
 * Verifies the server-authoritative return window, structured exclusions,
 * evidence rules, payer responsibility, and quantity calculations.
 */

import { describe, expect, it } from "vitest";
import type { ReturnLineSelection } from "@/features/returns/contracts";
import {
  evaluateReturnPolicy,
  evaluateReturnWindow,
  type EvidenceDecision,
  type ReturnPolicyTag,
  type VerifiedOrderSnapshot
} from "@/server/returns/return-policy";

const requestedAt = new Date("2026-07-30T16:00:00.000Z");

describe("return policy", () => {
  it("accepts a request exactly on calendar day 15", () => {
    expect(evaluateReturnWindow({
      confirmedDeliveryAt: "2026-07-15T16:00:00.000Z",
      requestedAt,
      businessTimeZone: "America/New_York"
    })).toMatchObject({ eligible: true, daysSinceDelivery: 15 });
  });

  it("rejects calendar day 16", () => {
    expect(evaluateReturnWindow({
      confirmedDeliveryAt: "2026-07-14T16:00:00.000Z",
      requestedAt,
      businessTimeZone: "America/New_York"
    })).toMatchObject({ eligible: false, daysSinceDelivery: 16, reason: "RETURN_WINDOW_EXPIRED" });
  });

  it("routes a missing carrier delivery date to manual review", () => {
    expect(evaluateReturnWindow({
      confirmedDeliveryAt: null,
      requestedAt,
      businessTimeZone: "America/New_York"
    })).toMatchObject({ eligible: false, requiresManualReview: true, daysSinceDelivery: null });
  });

  it("uses the configured business time zone instead of UTC dates", () => {
    expect(evaluateReturnWindow({
      confirmedDeliveryAt: "2026-07-15T03:30:00.000Z",
      requestedAt: new Date("2026-07-30T04:30:00.000Z"),
      businessTimeZone: "America/New_York"
    }).daysSinceDelivery).toBe(16);
  });

  it.each(["HOLIDAY", "SEASONAL"] as const)("rejects a regular %s item", (tag) => {
    const evaluation = evaluate({ tags: [tag] });
    expect(evaluation.lines[0]).toMatchObject({
      decision: "INELIGIBLE",
      decisionReason: "Holiday or seasonal item — final sale."
    });
  });

  it("accepts a sealed Party item and rejects it when opened", () => {
    expect(evaluate({ tags: ["PARTY"] }).lines[0].decision).toBe("ELIGIBLE");
    expect(evaluate({
      tags: ["PARTY"],
      selection: { partyOpened: true, declaredSealUnopened: false }
    }).lines[0]).toMatchObject({
      decision: "INELIGIBLE",
      decisionReason: "Opened Party item — not returnable."
    });
  });

  it("uses the structured brand-returnable flag", () => {
    expect(evaluate({ brandReturnable: false }).lines[0]).toMatchObject({
      decision: "INELIGIBLE",
      decisionReason: "Brand excluded from returns."
    });
  });

  it("allows an unopened cosmetic but rejects an opened cosmetic or sealed product", () => {
    expect(evaluate({ tags: ["COSMETIC"] }).lines[0].decision).toBe("ELIGIBLE");
    expect(evaluate({
      tags: ["COSMETIC"],
      selection: { declaredSealUnopened: false }
    }).lines[0].decision).toBe("INELIGIBLE");
    expect(evaluate({
      tags: ["SEALED"],
      selection: { declaredSealUnopened: false }
    }).lines[0].decision).toBe("INELIGIBLE");
  });

  it("rejects final-sale and direct-body-contact regular returns", () => {
    expect(evaluate({ finalSale: true }).lines[0].decisionReason).toBe("Final sale.");
    expect(evaluate({ tags: ["BODY_CONTACT"] }).lines[0].decisionReason).toBe("Hygiene or health restriction.");
  });

  it("routes a damaged non-returnable product to manual review", () => {
    const evaluation = evaluate({
      tags: ["HOLIDAY"],
      reason: "ARRIVED_DAMAGED",
      evidenceReferences: ["orderpro-evidence-1"],
      evidenceDecision: "APPROVED"
    });
    expect(evaluation.lines[0].decision).toBe("MANUAL_REVIEW");
    expect(evaluation.labelPayer).toBe("PENDING_REVIEW");
  });

  it("makes an approved company error company-paid", () => {
    const evaluation = evaluate({
      reason: "WRONG_VARIANT_SHIPPED",
      evidenceDecision: "APPROVED"
    });
    expect(evaluation.labelPayer).toBe("COMPANY");
    expect(evaluation.refundableOriginalFeesCents).toBe(1_200);
  });

  it("makes buyer remorse customer-paid and keeps original fees non-refundable", () => {
    const evaluation = evaluate({ reason: "CHANGED_MIND" });
    expect(evaluation.labelPayer).toBe("CUSTOMER");
    expect(evaluation.refundableOriginalFeesCents).toBe(0);
    expect(evaluation.originalShippingCents).toBe(900);
    expect(evaluation.originalLocalDeliveryCents).toBe(300);
  });

  it("makes a mixed return company-paid when one company claim is approved", () => {
    const evaluation = evaluateReturnPolicy({
      order: order({
        lines: [
          line({ orderLineId: "line-1" }),
          line({ orderLineId: "line-2", name: "Second item" })
        ]
      }),
      selections: [
        selection({ orderLineId: "line-1", reason: "CHANGED_MIND" }),
        selection({ orderLineId: "line-2", reason: "WRONG_VARIANT_SHIPPED" })
      ],
      evidenceDecisions: { "line-1": "NOT_REQUIRED", "line-2": "APPROVED" },
      requestedAt,
      businessTimeZone: "America/New_York"
    });
    expect(evaluation.labelPayer).toBe("COMPANY");
  });

  it("requires photos for damage, defect, wrong item, and missing parts", () => {
    for (const reason of ["ARRIVED_DAMAGED", "DEFECTIVE", "WRONG_ITEM_RECEIVED", "MISSING_PARTS"] as const) {
      expect(evaluate({ reason, evidenceDecision: "PENDING" }).lines[0]).toMatchObject({
        decision: "INELIGIBLE",
        decisionReason: "Photo evidence is required."
      });
    }
  });

  it("allows partial quantities but blocks quantities already returned or exceeding the balance", () => {
    expect(evaluate({
      deliveredQuantity: 3,
      previouslyReturnedQuantity: 1,
      selection: { quantity: 2 }
    }).lines[0].decision).toBe("ELIGIBLE");
    expect(evaluate({
      deliveredQuantity: 2,
      previouslyReturnedQuantity: 2
    }).lines[0].decisionReason).toBe("Quantity already returned.");
    expect(evaluate({
      deliveredQuantity: 3,
      previouslyReturnedQuantity: 1,
      selection: { quantity: 3 }
    }).lines[0].decisionReason).toBe("Requested quantity is not available for return.");
  });
});

function evaluate(input: {
  tags?: ReturnPolicyTag[];
  finalSale?: boolean;
  brandReturnable?: boolean;
  deliveredQuantity?: number;
  previouslyReturnedQuantity?: number;
  reason?: ReturnLineSelection["reason"];
  evidenceReferences?: string[];
  evidenceDecision?: EvidenceDecision;
  selection?: Partial<ReturnLineSelection>;
}) {
  const reason = input.reason ?? "CHANGED_MIND";
  return evaluateReturnPolicy({
    order: order({
      lines: [line({
        returnPolicyTags: input.tags ?? [],
        finalSale: input.finalSale ?? false,
        brandReturnable: input.brandReturnable ?? true,
        deliveredQuantity: input.deliveredQuantity ?? 2,
        previouslyReturnedQuantity: input.previouslyReturnedQuantity ?? 0
      })]
    }),
    selections: [selection({
      reason,
      evidenceReferences: input.evidenceReferences ?? [],
      ...input.selection
    })],
    evidenceDecisions: { "line-1": input.evidenceDecision ?? (reason === "CHANGED_MIND" ? "NOT_REQUIRED" : "PENDING") },
    requestedAt,
    businessTimeZone: "America/New_York"
  });
}

function order(overrides: Partial<VerifiedOrderSnapshot> = {}): VerifiedOrderSnapshot {
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
    lines: [line()],
    ...overrides
  };
}

function line(overrides: Partial<VerifiedOrderSnapshot["lines"][number]> = {}): VerifiedOrderSnapshot["lines"][number] {
  return {
    orderLineId: "line-1",
    squareVariationId: "variation-1",
    name: "Returnable item",
    variant: "Blue",
    sku: "SKU-1",
    upc: "123456789012",
    imageUrl: null,
    purchasedQuantity: 3,
    deliveredQuantity: 2,
    previouslyReturnedQuantity: 0,
    unitMerchandiseCents: 2_000,
    unitTaxCents: 177,
    unitDiscountCents: 200,
    finalSale: false,
    brandReturnable: true,
    returnPolicyTags: [],
    package: { lengthIn: 10, widthIn: 8, heightIn: 4, weightLb: 1.5 },
    ...overrides
  };
}

function selection(overrides: Partial<ReturnLineSelection> = {}): ReturnLineSelection {
  return {
    orderLineId: "line-1",
    quantity: 1,
    reason: "CHANGED_MIND",
    comment: "",
    evidenceReferences: [],
    declaredUnused: true,
    declaredOriginalPackaging: true,
    declaredSealUnopened: true,
    partyOpened: false,
    ...overrides
  };
}
