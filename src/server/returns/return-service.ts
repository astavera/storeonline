/**
 * Orchestrates verification, authoritative policy evaluation, OrderPRO RMA
 * creation, Shippo label purchase, and customer-safe status views.
 */

import "server-only";

import {
  returnLineSelectionSchema,
  type ReturnLineSelection,
  type ReturnQuoteView,
  type VerifiedReturnOrder
} from "@/features/returns/contracts";
import { getOrderProReturnsClient, type OrderProReturnsError } from "@/server/orderpro/returns-client";
import {
  evaluateOrderLineForDisplay,
  evaluateReturnPolicy,
  evaluateReturnWindow,
  type ReturnPolicyEvaluation
} from "@/server/returns/return-policy";
import {
  getReturnsRepository,
  type ReturnRequestRecord,
  type ReturnsRepository,
  type VerifiedSessionRecord
} from "@/server/returns/return-repository";
import {
  createReturnQuoteHandle,
  createVerificationHandle,
  stablePayloadHash,
  verifyReturnQuoteHandle,
  verifyVerificationHandle
} from "@/server/returns/return-security";
import {
  purchaseReturnLabel,
  quoteReturnLabel,
  ReturnLabelError,
  validateReturnLabelQuote,
  type ReturnLabelQuote
} from "@/server/returns/shippo-return-label";

const verificationStartSchema = {
  normalize(input: { orderNumber: string; email: string; postalCode: string }) {
    const orderNumber = input.orderNumber.trim();
    const email = input.email.trim().toLowerCase();
    const postalCode = input.postalCode.trim().toUpperCase();
    if (!orderNumber || orderNumber.length > 100) throw new ReturnsServiceError("INVALID_LOOKUP");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new ReturnsServiceError("INVALID_LOOKUP");
    }
    if (!/^[A-Z0-9 -]{3,12}$/.test(postalCode)) throw new ReturnsServiceError("INVALID_LOOKUP");
    return { orderNumber, email, postalCode };
  }
};

export type ReturnQuoteResult = {
  view: ReturnQuoteView;
  evaluation: ReturnPolicyEvaluation;
  labelQuote: ReturnLabelQuote | null;
};

type ReturnsServiceDependencies = {
  repository?: ReturnsRepository;
  orderPro?: ReturnType<typeof getOrderProReturnsClient>;
  now?: () => Date;
  quoteLabel?: typeof quoteReturnLabel;
  validateLabelQuote?: typeof validateReturnLabelQuote;
  purchaseLabel?: typeof purchaseReturnLabel;
};

export function createReturnsService(dependencies: ReturnsServiceDependencies = {}) {
  const repository = dependencies.repository ?? getReturnsRepository();
  const now = dependencies.now ?? (() => new Date());
  const quoteLabel = dependencies.quoteLabel ?? quoteReturnLabel;
  const validateLabelQuote = dependencies.validateLabelQuote ?? validateReturnLabelQuote;
  const purchaseLabel = dependencies.purchaseLabel ?? purchaseReturnLabel;

  function requireOrderPro() {
    const orderPro = dependencies.orderPro === undefined
      ? getOrderProReturnsClient()
      : dependencies.orderPro;
    if (!orderPro) throw new ReturnsServiceError("RETURNS_NOT_CONFIGURED");
    return orderPro;
  }

  async function requireSession(publicToken: string) {
    const session = await repository.readVerifiedSession(publicToken, now());
    if (!session) throw new ReturnsServiceError("SESSION_EXPIRED");
    return session;
  }

  async function startVerification(input: {
    orderNumber: string;
    email: string;
    postalCode: string;
  }) {
    const normalized = verificationStartSchema.normalize(input);
    const challenge = await requireOrderPro().startVerification(normalized);
    return {
      verificationHandle: createVerificationHandle({
        ...normalized,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt
      }),
      expiresAt: challenge.expiresAt
    };
  }

  async function confirmVerification(input: {
    verificationHandle: string;
    code: string;
  }): Promise<VerifiedReturnOrder> {
    const handle = verifyVerificationHandle(input.verificationHandle, now());
    const code = input.code.trim();
    if (!/^[A-Z0-9]{4,12}$/i.test(code)) throw new ReturnsServiceError("VERIFICATION_FAILED");
    const confirmation = await requireOrderPro().confirmVerification({
      challengeId: handle.challengeId,
      code
    });
    if (!confirmation.verified || !confirmation.snapshot) {
      throw new ReturnsServiceError("VERIFICATION_FAILED");
    }
    const session = await repository.createVerifiedSession({
      orderReferenceHash: handle.orderReferenceHash,
      emailHash: handle.emailHash,
      postalCodeHash: handle.postalCodeHash,
      snapshot: confirmation.snapshot,
      now: now()
    });
    return toVerifiedOrderView(session, now());
  }

  async function quote(input: {
    sessionToken: string;
    selections: ReturnLineSelection[];
  }): Promise<ReturnQuoteResult> {
    const session = await requireSession(input.sessionToken);
    const selections = input.selections.map((selection) => returnLineSelectionSchema.parse(selection));
    const preview = await requireOrderPro().preview({
      orderProOrderId: session.snapshot.orderProOrderId,
      selections
    });
    const evaluation = evaluateReturnPolicy({
      order: session.snapshot,
      selections,
      evidenceDecisions: preview.evidenceDecisions,
      requestedAt: now(),
      businessTimeZone: process.env.RETURNS_BUSINESS_TIME_ZONE || "America/New_York"
    });

    let labelQuote: ReturnLabelQuote | null = null;
    let labelNeedsManualReview = false;
    const blockingReasons = [...evaluation.blockingReasons];
    if (!evaluation.requiresManualReview && blockingReasons.length === 0) {
      try {
        labelQuote = await quoteLabel({
          order: session.snapshot,
          lines: evaluation.lines,
          now: now()
        });
      } catch (error) {
        if (!(error instanceof ReturnLabelError)) throw error;
        if (evaluation.labelPayer === "CUSTOMER") {
          blockingReasons.push(
            error.code === "RETURN_PACKAGE_DATA_MISSING"
              ? "Exact package weight or dimensions are unavailable; support must review this return before a customer-paid label can be accepted."
              : "An exact return-label price is not available. Please retry before confirming."
          );
        } else {
          labelNeedsManualReview = true;
        }
      }
    }

    const labelCostCents = labelQuote?.amountCents ?? 0;
    const labelDeductionCents = evaluation.labelPayer === "CUSTOMER" ? labelCostCents : 0;
    const estimatedNetRefundCents = Math.max(
      0,
      evaluation.merchandiseRefundCents +
      evaluation.estimatedTaxRefundCents +
      evaluation.refundableOriginalFeesCents -
      labelDeductionCents
    );
    const quotePayload = normalizedQuotePayload({
      sessionId: session.id,
      selections,
      evaluation,
      labelQuote,
      estimatedNetRefundCents
    });
    const expiresAt = labelQuote?.expiresAt ?? new Date(now().getTime() + 15 * 60_000).toISOString();
    const quoteToken = createReturnQuoteHandle({
      sessionId: session.id,
      quoteHash: stablePayloadHash(quotePayload),
      labelCostCents,
      shippoQuote: labelQuote,
      expiresAt
    });
    return {
      evaluation,
      labelQuote,
      view: {
        quoteToken,
        expiresAt,
        lines: evaluation.lines.map((line) => ({
          orderLineId: line.line.orderLineId,
          name: line.line.name,
          quantity: line.selection.quantity,
          reason: line.selection.reason,
          decision: line.decision,
          decisionReason: line.decisionReason
        })),
        merchandiseRefundCents: evaluation.merchandiseRefundCents,
        estimatedTaxRefundCents: evaluation.estimatedTaxRefundCents,
        discountAdjustmentCents: evaluation.discountAdjustmentCents,
        originalShippingCents: evaluation.originalShippingCents,
        originalLocalDeliveryCents: evaluation.originalLocalDeliveryCents,
        refundableOriginalFeesCents: evaluation.refundableOriginalFeesCents,
        labelPayer: evaluation.labelPayer,
        labelCostCents: labelQuote?.amountCents ?? null,
        labelCurrency: labelQuote?.currency ?? null,
        labelDeductionCents,
        estimatedNetRefundCents,
        requiresManualReview: evaluation.requiresManualReview || labelNeedsManualReview,
        canSubmit: blockingReasons.length === 0 && (
          evaluation.labelPayer !== "CUSTOMER" || Boolean(labelQuote)
        ),
        blockingReasons
      }
    };
  }

  async function getOrder(sessionToken: string) {
    const session = await requireSession(sessionToken);
    return toVerifiedOrderView(session, now());
  }

  async function createRequest(input: {
    sessionToken: string;
    quoteToken: string;
    selections: ReturnLineSelection[];
    idempotencyKey: string;
    policyAccepted: boolean;
    conditionAccepted: boolean;
    labelDeductionAccepted: boolean;
  }) {
    const acceptedAt = now();
    const session = await requireSession(input.sessionToken);
    const selections = input.selections.map((selection) => returnLineSelectionSchema.parse(selection));
    const quoteHandle = verifyReturnQuoteHandle(input.quoteToken, acceptedAt);
    if (quoteHandle.sessionId !== session.id) throw new ReturnsServiceError("QUOTE_MISMATCH");
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)) {
      throw new ReturnsServiceError("IDEMPOTENCY_KEY_INVALID");
    }

    const preview = await requireOrderPro().preview({
      orderProOrderId: session.snapshot.orderProOrderId,
      selections
    });
    const evaluation = evaluateReturnPolicy({
      order: session.snapshot,
      selections,
      evidenceDecisions: preview.evidenceDecisions,
      requestedAt: acceptedAt,
      businessTimeZone: process.env.RETURNS_BUSINESS_TIME_ZONE || "America/New_York"
    });
    const labelDeductionCents = evaluation.labelPayer === "CUSTOMER"
      ? quoteHandle.labelCostCents
      : 0;
    const estimatedNetRefundCents = Math.max(
      0,
      evaluation.merchandiseRefundCents +
      evaluation.estimatedTaxRefundCents +
      evaluation.refundableOriginalFeesCents -
      labelDeductionCents
    );
    const quotePayload = normalizedQuotePayload({
      sessionId: session.id,
      selections,
      evaluation,
      labelQuote: quoteHandle.shippoQuote,
      estimatedNetRefundCents
    });
    if (stablePayloadHash(quotePayload) !== quoteHandle.quoteHash) {
      throw new ReturnsServiceError("QUOTE_CHANGED");
    }
    if (evaluation.blockingReasons.length > 0) throw new ReturnsServiceError("RETURN_NOT_ELIGIBLE");
    if (evaluation.labelPayer === "CUSTOMER" && !quoteHandle.shippoQuote) {
      throw new ReturnsServiceError("EXACT_LABEL_COST_REQUIRED");
    }
    if (!input.policyAccepted || !input.conditionAccepted) {
      throw new ReturnsServiceError("ACKNOWLEDGEMENT_REQUIRED");
    }
    if (
      evaluation.labelPayer === "CUSTOMER" &&
      (!input.labelDeductionAccepted || labelDeductionCents <= 0)
    ) {
      throw new ReturnsServiceError("LABEL_DEDUCTION_ACCEPTANCE_REQUIRED");
    }
    if (quoteHandle.shippoQuote) {
      try {
        await validateLabelQuote({ quote: quoteHandle.shippoQuote, now: acceptedAt });
      } catch (error) {
        if (error instanceof ReturnLabelError) throw new ReturnsServiceError("QUOTE_CHANGED", { cause: error });
        throw error;
      }
    }

    const requestHash = stablePayloadHash({
      sessionId: session.id,
      quoteHash: quoteHandle.quoteHash,
      selections,
      policyAccepted: input.policyAccepted,
      conditionAccepted: input.conditionAccepted,
      labelDeductionAccepted: input.labelDeductionAccepted
    });
    const orderProRma = await requireOrderPro().createRma({
      order: session.snapshot,
      selections,
      evaluation,
      acceptedLabelCostCents: labelDeductionCents,
      quoteExpiresAt: quoteHandle.expiresAt,
      idempotencyKey: input.idempotencyKey
    });
    const saved = await repository.createRequest({
      verificationSessionId: session.id,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      rmaNumber: orderProRma.rma.rmaNumber,
      orderProRmaId: orderProRma.rma.id,
      order: session.snapshot,
      evaluation,
      acceptedLabelDeductionCents: labelDeductionCents,
      estimatedNetRefundCents,
      quoteSnapshot: quotePayload,
      acceptedAt,
      policyAccepted: input.policyAccepted,
      conditionAccepted: input.conditionAccepted,
      labelDeductionAccepted: input.labelDeductionAccepted
    });

    let record = saved.record;
    if (
      !saved.replayed &&
      orderProRma.rma.labelAuthorized &&
      !evaluation.requiresManualReview &&
      quoteHandle.shippoQuote
    ) {
      const claim = await repository.claimLabelPurchase(record.id);
      if (claim.claimed) {
        try {
          const label = await purchaseLabel({
            quote: quoteHandle.shippoQuote,
            rmaNumber: record.rmaNumber,
            now: acceptedAt
          });
          record = await repository.updateLabel({
            id: record.id,
            status: "LABEL_CREATED",
            shippoShipmentId: label.shipmentId,
            shippoRateId: label.rateId,
            shippoTransactionId: label.transactionId,
            shippoCarrier: label.carrier,
            shippoServiceLevel: label.serviceLevel,
            trackingNumber: label.trackingNumber,
            labelCostCents: label.amountCents,
            labelCurrency: label.currency,
            privateLabelUrl: label.privateLabelUrl,
            labelExpiresAt: label.labelExpiresAt
          });
        } catch (error) {
          record = await repository.updateLabel({
            id: record.id,
            status: "LABEL_PENDING",
            shippoShipmentId: quoteHandle.shippoQuote.shipmentId,
            shippoRateId: quoteHandle.shippoQuote.rateId,
            shippoCarrier: quoteHandle.shippoQuote.carrier,
            shippoServiceLevel: quoteHandle.shippoQuote.serviceLevel,
            labelCostCents: quoteHandle.shippoQuote.amountCents,
            labelCurrency: quoteHandle.shippoQuote.currency
          });
          record = (await repository.appendStatusEvent({
            requestId: record.id,
            status: "LABEL_PENDING",
            source: "storefront",
            externalEventId: `label-pending:${record.id}:purchase`,
            occurredAt: now(),
            details: { reason: "SHIPPO_LABEL_PURCHASE_FAILED" }
          })).record;
          void error;
        }
      } else {
        record = claim.record;
      }
    } else if (
      !saved.replayed &&
      orderProRma.rma.labelAuthorized &&
      !evaluation.requiresManualReview &&
      !quoteHandle.shippoQuote
    ) {
      record = await repository.updateLabel({
        id: record.id,
        status: "LABEL_PENDING"
      });
      record = (await repository.appendStatusEvent({
        requestId: record.id,
        status: "LABEL_PENDING",
        source: "storefront",
        externalEventId: `label-pending:${record.id}:package`,
        occurredAt: now(),
        details: { reason: "PACKAGE_DATA_OR_RATE_REQUIRES_REVIEW" }
      })).record;
    }

    return {
      replayed: saved.replayed,
      emailDispatched: orderProRma.rma.emailDispatched,
      request: toRequestView(record)
    };
  }

  async function getStatus(input: { sessionToken: string; rmaNumber: string }) {
    const session = await requireSession(input.sessionToken);
    const record = await repository.findRequestForSession({
      sessionId: session.id,
      rmaNumber: input.rmaNumber.trim()
    });
    if (!record) throw new ReturnsServiceError("RETURN_NOT_FOUND");
    try {
      const latest = await requireOrderPro().getStatus({ orderProRmaId: record.orderProRmaId! });
      if (
        latest.rma.status !== record.status &&
        canOrderProProjectStatus(record.status, latest.rma.status)
      ) {
        const updated = await repository.appendStatusEvent({
          requestId: record.id,
          status: latest.rma.status,
          source: "orderpro",
          externalEventId: `status:${latest.rma.id}:${latest.rma.updatedAt}`,
          occurredAt: new Date(latest.rma.updatedAt)
        });
        return toRequestView(updated.record);
      }
    } catch {
      // A saved status remains useful during a recoverable OrderPRO outage.
    }
    return toRequestView(record);
  }

  async function uploadEvidence(input: {
    sessionToken: string;
    orderLineId: string;
    file: File;
  }) {
    const session = await requireSession(input.sessionToken);
    if (!session.snapshot.lines.some((line) => line.orderLineId === input.orderLineId)) {
      throw new ReturnsServiceError("RETURN_LINE_INVALID");
    }
    validateEvidenceFile(input.file);
    return requireOrderPro().uploadEvidence({
      challengeSessionId: session.id,
      orderLineId: input.orderLineId,
      file: input.file
    });
  }

  return {
    startVerification,
    confirmVerification,
    getOrder,
    quote,
    createRequest,
    getStatus,
    uploadEvidence,
    requireSession
  };
}

function toVerifiedOrderView(session: VerifiedSessionRecord, now: Date): VerifiedReturnOrder {
  const window = evaluateReturnWindow({
    confirmedDeliveryAt: session.snapshot.confirmedDeliveryAt,
    requestedAt: now,
    businessTimeZone: process.env.RETURNS_BUSINESS_TIME_ZONE || "America/New_York"
  });
  return {
    sessionToken: session.publicToken,
    expiresAt: session.expiresAt.toISOString(),
    orderNumber: session.snapshot.orderNumber,
    deliveredAt: session.snapshot.confirmedDeliveryAt,
    currency: session.snapshot.currency,
    lines: session.snapshot.lines.map((line) => {
      const evaluated = evaluateOrderLineForDisplay({
        line,
        window,
        fulfillmentStatus: session.snapshot.fulfillmentStatus
      });
      return {
        orderLineId: line.orderLineId,
        imageUrl: line.imageUrl,
        name: line.name,
        variant: line.variant,
        sku: line.sku,
        upc: line.upc,
        purchasedQuantity: line.purchasedQuantity,
        deliveredQuantity: line.deliveredQuantity,
        previouslyReturnedQuantity: line.previouslyReturnedQuantity,
        ...evaluated
      };
    })
  };
}

function normalizedQuotePayload(input: {
  sessionId: string;
  selections: ReturnLineSelection[];
  evaluation: ReturnPolicyEvaluation;
  labelQuote: ReturnLabelQuote | null;
  estimatedNetRefundCents: number;
}) {
  return {
    sessionId: input.sessionId,
    selections: input.selections,
    policyVersion: input.evaluation.policyVersion,
    businessTimeZone: input.evaluation.businessTimeZone,
    confirmedDeliveryAt: input.evaluation.confirmedDeliveryAt,
    lines: input.evaluation.lines.map((line) => ({
      orderLineId: line.line.orderLineId,
      decision: line.decision,
      decisionReason: line.decisionReason,
      evidenceDecision: line.evidenceDecision,
      merchandiseRefundCents: line.merchandiseRefundCents,
      estimatedTaxRefundCents: line.estimatedTaxRefundCents,
      discountAdjustmentCents: line.discountAdjustmentCents
    })),
    labelPayer: input.evaluation.labelPayer,
    merchandiseRefundCents: input.evaluation.merchandiseRefundCents,
    estimatedTaxRefundCents: input.evaluation.estimatedTaxRefundCents,
    discountAdjustmentCents: input.evaluation.discountAdjustmentCents,
    refundableOriginalFeesCents: input.evaluation.refundableOriginalFeesCents,
    originalShippingCents: input.evaluation.originalShippingCents,
    originalLocalDeliveryCents: input.evaluation.originalLocalDeliveryCents,
    labelQuote: input.labelQuote,
    estimatedNetRefundCents: input.estimatedNetRefundCents
  };
}

function toRequestView(record: ReturnRequestRecord) {
  return {
    rmaNumber: record.rmaNumber,
    status: record.status,
    items: record.items,
    carrier: record.shippoCarrier,
    serviceLevel: record.shippoServiceLevel,
    trackingNumber: record.trackingNumber,
    labelExpiresAt: record.labelExpiresAt?.toISOString() ?? null,
    estimatedNetRefundCents: record.estimatedNetRefundCents,
    finalApprovedRefundCents: record.finalApprovedRefundCents,
    labelDownloadUrl: record.shippoTransactionId
      ? `/api/returns/${encodeURIComponent(record.rmaNumber)}/label`
      : null,
    packingSlipDownloadUrl:
      `/api/returns/${encodeURIComponent(record.rmaNumber)}/packing-slip`,
    events: record.events.map((event) => ({
      status: event.status,
      source: event.source,
      occurredAt: event.occurredAt.toISOString()
    }))
  };
}

function validateEvidenceFile(file: File) {
  if (file.size < 1 || file.size > 8 * 1024 * 1024) {
    throw new ReturnsServiceError("EVIDENCE_FILE_SIZE_INVALID");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new ReturnsServiceError("EVIDENCE_FILE_TYPE_INVALID");
  }
}

function canOrderProProjectStatus(
  current: ReturnRequestRecord["status"],
  next: ReturnRequestRecord["status"]
) {
  if (["REFUND_PENDING", "REFUNDED", "COMPLETED"].includes(current)) return false;
  return new Set<ReturnRequestRecord["status"]>([
    "MANUAL_REVIEW",
    "AUTHORIZED",
    "RECEIVED",
    "INSPECTING",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CANCELLED",
    "EXCEPTION"
  ]).has(next);
}

export class ReturnsServiceError extends Error {
  readonly code: string;

  constructor(code: string, options?: { cause?: unknown }) {
    super(customerSafeMessage(code), options);
    this.name = "ReturnsServiceError";
    this.code = code;
  }
}

function customerSafeMessage(code: string) {
  if (code === "SESSION_EXPIRED") return "Your secure return session expired. Please verify the order again.";
  if (code === "QUOTE_CHANGED" || code === "RETURN_QUOTE_EXPIRED") {
    return "Return details changed or expired. Please review the updated estimate.";
  }
  if (code === "RETURN_NOT_ELIGIBLE") return "One or more selected items are not eligible for this return.";
  if (code === "EXACT_LABEL_COST_REQUIRED") return "An exact return-label cost is required before confirmation.";
  if (code === "RETURN_NOT_FOUND") return "We could not find that return in this verified session.";
  if (code === "VERIFICATION_FAILED") return "We could not verify those details. Check the code and try again.";
  return "We could not complete that returns request. Please try again.";
}

export function isOrderProReturnsError(error: unknown): error is OrderProReturnsError {
  return error instanceof Error && error.name === "OrderProReturnsError";
}
