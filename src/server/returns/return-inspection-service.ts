/**
 * Recalculates the final approved refund from persisted RMA lines after
 * OrderPRO inspection, then submits one linked, idempotent Square refund.
 */

import "server-only";

import { z } from "zod";
import { getReturnsRepository, type ReturnsRepository } from "@/server/returns/return-repository";
import { refundReturnToOriginalPayment } from "@/server/returns/square-return-refund";

export const inspectionResultSchema = z.object({
  eventId: z.string().trim().min(8).max(200),
  orderProRmaId: z.string().trim().min(1).max(200),
  inspectedAt: z.string().datetime(),
  lines: z.array(z.object({
    orderLineId: z.string().trim().min(1).max(160),
    approvedQuantity: z.number().int().nonnegative().max(100),
    disposition: z.enum(["AVAILABLE_ONLINE", "DAMAGED", "QUARANTINED", "MANUAL_REVIEW"])
  }).strict()).min(1).max(200)
}).strict();

export function createReturnInspectionService(dependencies: {
  repository?: ReturnsRepository;
  refund?: typeof refundReturnToOriginalPayment;
} = {}) {
  const repository = dependencies.repository ?? getReturnsRepository();
  const refund = dependencies.refund ?? refundReturnToOriginalPayment;

  return {
    async process(raw: z.infer<typeof inspectionResultSchema>) {
      const input = inspectionResultSchema.parse(raw);
      const request = await repository.findRequestByOrderProRmaId(input.orderProRmaId);
      if (!request) throw new ReturnInspectionError("RMA_NOT_FOUND");
      const requestedLines = new Map(request.items.map((line) => [line.orderLineId, line]));
      const duplicateIds = input.lines
        .map((line) => line.orderLineId)
        .filter((id, index, values) => values.indexOf(id) !== index);
      if (duplicateIds.length > 0) throw new ReturnInspectionError("DUPLICATE_INSPECTION_LINE");

      let approvedMerchandiseCents = 0;
      let approvedTaxCents = 0;
      let approvedLineCount = 0;
      for (const inspected of input.lines) {
        const line = requestedLines.get(inspected.orderLineId);
        if (!line || inspected.approvedQuantity > line.quantity) {
          throw new ReturnInspectionError("INSPECTION_QUANTITY_INVALID");
        }
        if (inspected.approvedQuantity > 0) {
          approvedLineCount += 1;
          approvedMerchandiseCents += proportional(
            line.merchandiseRefundCents,
            inspected.approvedQuantity,
            line.quantity
          );
          approvedTaxCents += proportional(
            line.estimatedTaxRefundCents,
            inspected.approvedQuantity,
            line.quantity
          );
        }
      }

      const allApproved = input.lines.every((inspected) => {
        const line = requestedLines.get(inspected.orderLineId);
        return line && inspected.approvedQuantity === line.quantity;
      }) && input.lines.length === request.items.length;
      const inspectionStatus = approvedLineCount === 0
        ? "REJECTED" as const
        : allApproved
          ? "APPROVED" as const
          : "PARTIALLY_APPROVED" as const;
      const finalApprovedRefundCents = Math.max(
        0,
        approvedMerchandiseCents +
        approvedTaxCents +
        (approvedLineCount > 0 ? request.refundableOriginalFeesCents : 0) -
        request.acceptedLabelDeductionCents
      );
      const inspectionEvent = await repository.appendStatusEvent({
        requestId: request.id,
        status: inspectionStatus,
        source: "orderpro",
        externalEventId: input.eventId,
        occurredAt: new Date(input.inspectedAt),
        details: {
          lines: input.lines,
          inventoryInitialState: "RETURN_STAGED_OR_QUARANTINED",
          approvedMerchandiseCents,
          approvedTaxCents,
          acceptedLabelDeductionCents: request.acceptedLabelDeductionCents,
          finalApprovedRefundCents
        }
      });

      if (inspectionStatus === "REJECTED" || finalApprovedRefundCents === 0) {
        return {
          replayed: inspectionEvent.replayed,
          status: inspectionStatus,
          finalApprovedRefundCents,
          refund: null
        };
      }
      if (inspectionEvent.replayed && inspectionEvent.record.squareRefundId) {
        return {
          replayed: true,
          status: inspectionEvent.record.status,
          finalApprovedRefundCents: inspectionEvent.record.finalApprovedRefundCents ?? finalApprovedRefundCents,
          refund: {
            refundId: inspectionEvent.record.squareRefundId,
            status: inspectionEvent.record.squareRefundStatus ?? "PENDING",
            amountCents: inspectionEvent.record.squareRefundAmountCents ?? finalApprovedRefundCents,
            currency: "USD" as const
          }
        };
      }
      if (!request.squarePaymentId) throw new ReturnInspectionError("SQUARE_PAYMENT_ID_MISSING");
      await repository.updateRefund({
        id: request.id,
        status: "REFUND_PENDING",
        finalApprovedRefundCents,
        squarePaymentId: request.squarePaymentId,
        squareRefundId: request.squareRefundId,
        squareRefundAmountCents: finalApprovedRefundCents,
        squareRefundCurrency: request.currency,
        squareRefundStatus: request.squareRefundStatus ?? "PENDING"
      });
      const square = await refund({
        rmaNumber: request.rmaNumber,
        paymentId: request.squarePaymentId,
        amountCents: finalApprovedRefundCents
      });
      const completed = square.status === "COMPLETED";
      const saved = await repository.updateRefund({
        id: request.id,
        status: completed ? "REFUNDED" : "REFUND_PENDING",
        finalApprovedRefundCents,
        squarePaymentId: request.squarePaymentId,
        squareRefundId: square.refundId,
        squareRefundAmountCents: square.amountCents,
        squareRefundCurrency: square.currency,
        squareRefundStatus: square.status
      });
      return {
        replayed: false,
        status: saved.status,
        finalApprovedRefundCents,
        refund: square
      };
    }
  };
}

function proportional(total: number, approvedQuantity: number, requestedQuantity: number) {
  return Math.round((total * approvedQuantity) / requestedQuantity);
}

export class ReturnInspectionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("The inspection result could not be applied.");
    this.name = "ReturnInspectionError";
    this.code = code;
  }
}
