/**
 * Browser-safe contracts for the return portal. The server recalculates every
 * eligibility, payer, amount, and transition from trusted OrderPRO facts.
 */

import { z } from "zod";

export const returnReasonOptions = [
  { code: "ARRIVED_DAMAGED", value: "ARRIVED_DAMAGED", label: "Arrived damaged", group: "company" },
  { code: "DEFECTIVE", value: "DEFECTIVE", label: "Defective", group: "company" },
  { code: "WRONG_ITEM_RECEIVED", value: "WRONG_ITEM_RECEIVED", label: "Wrong item received", group: "company" },
  { code: "WRONG_VARIANT_SHIPPED", value: "WRONG_VARIANT_SHIPPED", label: "Wrong color or size shipped", group: "company" },
  { code: "MISSING_PARTS", value: "MISSING_PARTS", label: "Missing parts", group: "company" },
  { code: "INCORRECT_QUANTITY_SHIPPED", value: "INCORRECT_QUANTITY_SHIPPED", label: "Incorrect quantity shipped", group: "company" },
  { code: "CHANGED_MIND", value: "CHANGED_MIND", label: "Changed mind", group: "customer" },
  { code: "ORDERED_BY_MISTAKE", value: "ORDERED_BY_MISTAKE", label: "Ordered by mistake", group: "customer" },
  { code: "DISLIKED_SELECTED_COLOR", value: "DISLIKED_SELECTED_COLOR", label: "Did not like the selected color", group: "customer" },
  { code: "SELECTED_SIZE_DID_NOT_FIT", value: "SELECTED_SIZE_DID_NOT_FIT", label: "Selected size did not fit", group: "customer" },
  { code: "NO_LONGER_NEEDED", value: "NO_LONGER_NEEDED", label: "No longer needed", group: "customer" },
  { code: "OTHER_PREFERENCE", value: "OTHER_PREFERENCE", label: "Other personal preference", group: "customer" }
] as const;

export const returnReasonSchema = z.enum(returnReasonOptions.map((reason) => reason.code) as [
  typeof returnReasonOptions[number]["code"],
  ...Array<typeof returnReasonOptions[number]["code"]>
]);
export type ReturnReasonCode = z.infer<typeof returnReasonSchema>;
export type ReturnReason = ReturnReasonCode;
export const companyPaidReturnReasons: ReturnReasonCode[] = returnReasonOptions
  .filter((reason) => reason.group === "company")
  .map((reason) => reason.value);

export const returnsStatusSchema = z.enum([
  "REQUESTED",
  "MANUAL_REVIEW",
  "AUTHORIZED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "DROPPED_OFF",
  "IN_TRANSIT",
  "DELIVERED_TO_WH01",
  "RECEIVED",
  "INSPECTING",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "REFUND_PENDING",
  "REFUNDED",
  "COMPLETED",
  "CANCELLED",
  "EXCEPTION"
]);
export type ReturnsStatus = z.infer<typeof returnsStatusSchema>;

const stableIdSchema = z.string().trim().min(1).max(500);

export const returnLineSelectionSchema = z.object({
  orderLineId: stableIdSchema,
  quantity: z.number().int().positive().max(999),
  reason: returnReasonSchema,
  comment: z.string().trim().max(1_000),
  evidenceReferences: z.array(stableIdSchema).max(6),
  declaredUnused: z.boolean(),
  declaredOriginalPackaging: z.boolean(),
  declaredSealUnopened: z.boolean(),
  partyOpened: z.boolean()
}).strict();
export type ReturnLineSelection = z.infer<typeof returnLineSelectionSchema>;

export type PublicReturnLine = {
  orderLineId: string;
  imageUrl: string | null;
  name: string;
  variant: string | null;
  sku: string | null;
  upc: string | null;
  purchasedQuantity: number;
  deliveredQuantity: number;
  previouslyReturnedQuantity: number;
  eligibleQuantity: number;
  eligibility: "ELIGIBLE" | "MANUAL_REVIEW" | "INELIGIBLE";
  eligibilityReason: string;
  requiresSealConfirmation: boolean;
  partyItem: boolean;
};

export type VerifiedReturnOrder = {
  sessionToken?: string;
  expiresAt: string;
  orderNumber: string;
  deliveredAt: string | null;
  currency: "USD";
  lines: PublicReturnLine[];
};

export type ReturnQuoteView = {
  quoteToken: string;
  expiresAt: string;
  lines: Array<{
    orderLineId: string;
    name: string;
    quantity: number;
    reason: ReturnReasonCode;
    decision: "ELIGIBLE" | "MANUAL_REVIEW" | "INELIGIBLE";
    decisionReason: string;
  }>;
  merchandiseRefundCents: number;
  estimatedTaxRefundCents: number;
  discountAdjustmentCents: number;
  originalShippingCents: number;
  originalLocalDeliveryCents: number;
  refundableOriginalFeesCents: number;
  labelPayer: "COMPANY" | "CUSTOMER" | "PENDING_REVIEW";
  labelCostCents: number | null;
  labelCurrency: string | null;
  labelDeductionCents: number;
  estimatedNetRefundCents: number;
  requiresManualReview: boolean;
  canSubmit: boolean;
  blockingReasons: string[];
};

export const customerReturnPolicyText = `Most eligible items may be returned within 15 calendar days of confirmed delivery. Items must be unused, unopened and in their original, salable condition, with all original packaging intact.

Holiday and seasonal merchandise is final sale. Opened Party items, products from non-returnable brands, intimate apparel, opened cosmetics and opened health or hygiene products are not eligible for return.

We will cover 100% of the return-label cost when an item arrives defective, damaged or incorrect. For buyer-remorse returns, including changes of mind, color preference or fit of the size originally selected, the return-label cost is the customer’s responsibility and will be deducted from the final refund.

Original shipping and local-delivery fees are non-refundable. Approved refunds are issued to the original form of payment after the returned merchandise has been received and inspected.`;

export const returnPackingInstructions = `Place each approved item in its original product packaging. Place the product packaging inside a sturdy shipping box. Include the return packing slip inside the package. Do not attach the shipping label directly to the product’s retail packaging. Securely tape the shipping box and attach the return label to the outside. Drop the package off with the carrier shown on the label.`;
export const returnPolicyCopy = customerReturnPolicyText;
export const packingInstructions = returnPackingInstructions;
