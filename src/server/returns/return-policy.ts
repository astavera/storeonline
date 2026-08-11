/**
 * Authoritative, side-effect-free return policy.
 *
 * Inputs are trusted snapshots supplied by OrderPRO. Browser-provided payer,
 * eligibility, refund, and evidence decisions are never accepted.
 */

import "server-only";

import type { ReturnLineSelection, ReturnReasonCode } from "@/features/returns/contracts";

export const RETURNS_POLICY_VERSION = "2026-07-30";
export const RETURN_WINDOW_DAYS = 15;

export const returnPolicyTags = [
  "HOLIDAY",
  "SEASONAL",
  "PARTY",
  "INTIMATE_APPAREL",
  "COSMETIC",
  "PERSONAL_CARE",
  "HYGIENE",
  "HEALTH",
  "SEALED",
  "BODY_CONTACT",
  "PERSONALIZED"
] as const;

export type ReturnPolicyTag = typeof returnPolicyTags[number];
export type EvidenceDecision = "APPROVED" | "PENDING" | "REJECTED" | "NOT_REQUIRED";

export type VerifiedOrderSnapshot = {
  orderProOrderId: string;
  orderNumber: string;
  squarePaymentId: string | null;
  currency: "USD";
  fulfillmentStatus: string;
  confirmedDeliveryAt: string | null;
  originalShippingCents: number;
  originalLocalDeliveryCents: number;
  returnAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  lines: VerifiedOrderLineSnapshot[];
};

export type VerifiedOrderLineSnapshot = {
  orderLineId: string;
  squareVariationId: string | null;
  name: string;
  variant: string | null;
  sku: string | null;
  upc: string | null;
  imageUrl: string | null;
  purchasedQuantity: number;
  deliveredQuantity: number;
  previouslyReturnedQuantity: number;
  unitMerchandiseCents: number;
  unitTaxCents: number;
  unitDiscountCents: number;
  finalSale: boolean;
  brandReturnable: boolean;
  returnPolicyTags: ReturnPolicyTag[];
  package: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    weightLb: number;
  } | null;
};

export type ReturnWindowEvaluation = {
  eligible: boolean;
  requiresManualReview: boolean;
  daysSinceDelivery: number | null;
  reason: "ELIGIBLE" | "DELIVERY_DATE_UNAVAILABLE" | "RETURN_WINDOW_EXPIRED";
};

export type EvaluatedReturnLine = {
  line: VerifiedOrderLineSnapshot;
  selection: ReturnLineSelection;
  decision: "ELIGIBLE" | "MANUAL_REVIEW" | "INELIGIBLE";
  decisionReason: string;
  evidenceDecision: EvidenceDecision;
  merchandiseRefundCents: number;
  estimatedTaxRefundCents: number;
  discountAdjustmentCents: number;
  payer: "COMPANY" | "CUSTOMER";
};

export type ReturnPolicyEvaluation = {
  policyVersion: string;
  businessTimeZone: string;
  confirmedDeliveryAt: string | null;
  daysSinceDelivery: number | null;
  lines: EvaluatedReturnLine[];
  labelPayer: "COMPANY" | "CUSTOMER" | "PENDING_REVIEW";
  merchandiseRefundCents: number;
  estimatedTaxRefundCents: number;
  discountAdjustmentCents: number;
  refundableOriginalFeesCents: number;
  originalShippingCents: number;
  originalLocalDeliveryCents: number;
  requiresManualReview: boolean;
  blockingReasons: string[];
};

const companyReasons = new Set<ReturnReasonCode>([
  "ARRIVED_DAMAGED",
  "DEFECTIVE",
  "WRONG_ITEM_RECEIVED",
  "WRONG_VARIANT_SHIPPED",
  "MISSING_PARTS",
  "INCORRECT_QUANTITY_SHIPPED"
]);

const photoReasons = new Set<ReturnReasonCode>([
  "ARRIVED_DAMAGED",
  "DEFECTIVE",
  "WRONG_ITEM_RECEIVED",
  "MISSING_PARTS"
]);

export function evaluateReturnWindow(input: {
  confirmedDeliveryAt: string | null;
  requestedAt: Date;
  businessTimeZone: string;
}): ReturnWindowEvaluation {
  validateTimeZone(input.businessTimeZone);
  if (!input.confirmedDeliveryAt) {
    return {
      eligible: false,
      requiresManualReview: true,
      daysSinceDelivery: null,
      reason: "DELIVERY_DATE_UNAVAILABLE"
    };
  }
  const daysSinceDelivery =
    calendarDayNumber(input.requestedAt, input.businessTimeZone) -
    calendarDayNumber(new Date(input.confirmedDeliveryAt), input.businessTimeZone);
  const eligible = daysSinceDelivery >= 0 && daysSinceDelivery <= RETURN_WINDOW_DAYS;
  return {
    eligible,
    requiresManualReview: false,
    daysSinceDelivery,
    reason: eligible ? "ELIGIBLE" : "RETURN_WINDOW_EXPIRED"
  };
}

export function evaluateOrderLineForDisplay(input: {
  line: VerifiedOrderLineSnapshot;
  window: ReturnWindowEvaluation;
  fulfillmentStatus: string;
}) {
  const available = eligibleQuantity(input.line);
  const delivered = input.fulfillmentStatus.toUpperCase().includes("DELIVERED");
  if (!delivered && input.line.deliveredQuantity < 1) {
    return displayResult(0, "INELIGIBLE", "Order has not been delivered.", input.line);
  }
  if (input.window.requiresManualReview) {
    return displayResult(
      available,
      "MANUAL_REVIEW",
      "Carrier delivery date is unavailable — manual review required.",
      input.line
    );
  }
  if (!input.window.eligible) {
    return displayResult(0, "INELIGIBLE", "Return window expired.", input.line);
  }
  if (available < 1) {
    return displayResult(0, "INELIGIBLE", "Quantity already returned.", input.line);
  }
  const restriction = structuredRestriction(input.line, false, true);
  if (restriction) {
    return displayResult(
      available,
      "MANUAL_REVIEW",
      `${restriction} Damage, defect, or fulfillment-error claims require review.`,
      input.line
    );
  }
  return displayResult(available, "ELIGIBLE", "Eligible, subject to warehouse inspection.", input.line);
}

export function evaluateReturnPolicy(input: {
  order: VerifiedOrderSnapshot;
  selections: ReturnLineSelection[];
  evidenceDecisions: Record<string, EvidenceDecision>;
  requestedAt: Date;
  businessTimeZone: string;
}): ReturnPolicyEvaluation {
  const window = evaluateReturnWindow({
    confirmedDeliveryAt: input.order.confirmedDeliveryAt,
    requestedAt: input.requestedAt,
    businessTimeZone: input.businessTimeZone
  });
  const seen = new Set<string>();
  const lines = input.selections.map((selection) => {
    if (seen.has(selection.orderLineId)) {
      throw new ReturnPolicyError("DUPLICATE_ORDER_LINE");
    }
    seen.add(selection.orderLineId);
    const line = input.order.lines.find((candidate) => candidate.orderLineId === selection.orderLineId);
    if (!line) throw new ReturnPolicyError("ORDER_LINE_NOT_FOUND");
    return evaluateLine({
      line,
      selection,
      evidenceDecision: input.evidenceDecisions[line.orderLineId] ?? "NOT_REQUIRED",
      window,
      fulfillmentStatus: input.order.fulfillmentStatus
    });
  });

  const requiresManualReview = lines.some((line) => line.decision === "MANUAL_REVIEW");
  const eligibleLines = lines.filter((line) => line.decision === "ELIGIBLE");
  const companyApproved = eligibleLines.some((line) => line.payer === "COMPANY");
  const labelPayer = requiresManualReview
    ? "PENDING_REVIEW" as const
    : companyApproved
      ? "COMPANY" as const
      : "CUSTOMER" as const;
  const merchandiseRefundCents = sum(eligibleLines.map((line) => line.merchandiseRefundCents));
  const estimatedTaxRefundCents = sum(eligibleLines.map((line) => line.estimatedTaxRefundCents));
  const discountAdjustmentCents = sum(eligibleLines.map((line) => line.discountAdjustmentCents));
  const refundableOriginalFeesCents = labelPayer === "COMPANY"
    ? input.order.originalShippingCents + input.order.originalLocalDeliveryCents
    : 0;
  const blockingReasons = lines
    .filter((line) => line.decision === "INELIGIBLE")
    .map((line) => `${line.line.name}: ${line.decisionReason}`);

  return {
    policyVersion: RETURNS_POLICY_VERSION,
    businessTimeZone: input.businessTimeZone,
    confirmedDeliveryAt: input.order.confirmedDeliveryAt,
    daysSinceDelivery: window.daysSinceDelivery,
    lines,
    labelPayer,
    merchandiseRefundCents,
    estimatedTaxRefundCents,
    discountAdjustmentCents,
    refundableOriginalFeesCents,
    originalShippingCents: input.order.originalShippingCents,
    originalLocalDeliveryCents: input.order.originalLocalDeliveryCents,
    requiresManualReview,
    blockingReasons
  };
}

function evaluateLine(input: {
  line: VerifiedOrderLineSnapshot;
  selection: ReturnLineSelection;
  evidenceDecision: EvidenceDecision;
  window: ReturnWindowEvaluation;
  fulfillmentStatus: string;
}): EvaluatedReturnLine {
  const payer = companyReasons.has(input.selection.reason) ? "COMPANY" as const : "CUSTOMER" as const;
  const money = lineMoney(input.line, input.selection.quantity);
  const result = (
    decision: EvaluatedReturnLine["decision"],
    decisionReason: string,
    evidenceDecision = input.evidenceDecision
  ): EvaluatedReturnLine => ({
    line: input.line,
    selection: input.selection,
    decision,
    decisionReason,
    evidenceDecision,
    ...money,
    payer
  });

  const available = eligibleQuantity(input.line);
  const delivered = input.fulfillmentStatus.toUpperCase().includes("DELIVERED")
    || input.line.deliveredQuantity > 0;
  if (!delivered) return result("INELIGIBLE", "Order has not been delivered.");
  if (input.window.requiresManualReview) {
    return result("MANUAL_REVIEW", "Carrier delivery date is unavailable.");
  }
  if (!input.window.eligible) return result("INELIGIBLE", "Return window expired.");
  if (available < 1) return result("INELIGIBLE", "Quantity already returned.");
  if (
    !Number.isInteger(input.selection.quantity) ||
    input.selection.quantity < 1 ||
    input.selection.quantity > available
  ) {
    return result("INELIGIBLE", "Requested quantity is not available for return.");
  }
  if (input.selection.reason === "OTHER_PREFERENCE" && !input.selection.comment.trim()) {
    return result("INELIGIBLE", "A comment is required for Other personal preference.");
  }

  const restriction = structuredRestriction(
    input.line,
    input.selection.partyOpened,
    input.selection.declaredSealUnopened
  );
  if (restriction) {
    return payer === "COMPANY"
      ? result("MANUAL_REVIEW", `${restriction} This claim requires audited support review.`)
      : result("INELIGIBLE", restriction);
  }

  if (
    payer === "CUSTOMER" &&
    (
      !input.selection.declaredUnused ||
      !input.selection.declaredOriginalPackaging ||
      !input.selection.declaredSealUnopened
    )
  ) {
    return result("INELIGIBLE", "Unused, original-packaging, and unopened-seal confirmations are required.");
  }

  if (photoReasons.has(input.selection.reason)) {
    if (input.selection.evidenceReferences.length < 1) {
      return result("INELIGIBLE", "Photo evidence is required.", "PENDING");
    }
    if (input.evidenceDecision === "APPROVED") {
      return result("ELIGIBLE", "Claim evidence approved.");
    }
    if (input.evidenceDecision === "REJECTED") {
      return result("INELIGIBLE", "The submitted claim evidence was not approved.");
    }
    return result("MANUAL_REVIEW", "Photo evidence is pending review.", "PENDING");
  }

  return result("ELIGIBLE", "Eligible, subject to warehouse inspection.");
}

function structuredRestriction(
  line: VerifiedOrderLineSnapshot,
  partyOpened: boolean,
  sealUnopened: boolean
) {
  const tags = new Set(line.returnPolicyTags);
  if (line.finalSale) return "Final sale.";
  if (tags.has("HOLIDAY") || tags.has("SEASONAL")) return "Holiday or seasonal item — final sale.";
  if (!line.brandReturnable) return "Brand excluded from returns.";
  if (tags.has("PERSONALIZED")) return "Personalized item — not returnable.";
  if (tags.has("PARTY") && partyOpened) return "Opened Party item — not returnable.";
  if (
    tags.has("INTIMATE_APPAREL") ||
    tags.has("HYGIENE") ||
    tags.has("BODY_CONTACT") ||
    ((tags.has("COSMETIC") || tags.has("PERSONAL_CARE") || tags.has("HEALTH")) && !sealUnopened) ||
    (tags.has("SEALED") && !sealUnopened)
  ) {
    return "Hygiene or health restriction.";
  }
  return null;
}

function eligibleQuantity(line: VerifiedOrderLineSnapshot) {
  return Math.max(
    0,
    Math.min(line.purchasedQuantity, line.deliveredQuantity) - line.previouslyReturnedQuantity
  );
}

function lineMoney(line: VerifiedOrderLineSnapshot, quantity: number) {
  const safeQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
  const gross = line.unitMerchandiseCents * safeQuantity;
  const discountAdjustmentCents = Math.min(gross, line.unitDiscountCents * safeQuantity);
  return {
    merchandiseRefundCents: gross - discountAdjustmentCents,
    estimatedTaxRefundCents: line.unitTaxCents * safeQuantity,
    discountAdjustmentCents
  };
}

function displayResult(
  eligible: number,
  eligibility: "ELIGIBLE" | "MANUAL_REVIEW" | "INELIGIBLE",
  eligibilityReason: string,
  line: VerifiedOrderLineSnapshot
) {
  const tags = new Set(line.returnPolicyTags);
  return {
    eligibleQuantity: eligible,
    eligibility,
    eligibilityReason,
    requiresSealConfirmation:
      tags.has("PARTY") ||
      tags.has("COSMETIC") ||
      tags.has("PERSONAL_CARE") ||
      tags.has("HYGIENE") ||
      tags.has("HEALTH") ||
      tags.has("SEALED"),
    partyItem: tags.has("PARTY")
  };
}

function calendarDayNumber(value: Date, timeZone: string) {
  if (!Number.isFinite(value.getTime())) throw new ReturnPolicyError("INVALID_DATE");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function validateTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new ReturnPolicyError("INVALID_TIME_ZONE");
  }
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export class ReturnPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReturnPolicyError";
  }
}
