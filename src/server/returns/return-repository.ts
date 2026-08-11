/**
 * Persists verified sessions and a storefront mirror of OrderPRO RMAs. The
 * development fallback is process-local and never enabled outside development.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import type { ReturnsStatus } from "@/features/returns/contracts";
import { getPrismaClient } from "@/server/db/prisma";
import {
  PersistenceUnavailableError,
  requireDatabaseOrDevelopmentFallback
} from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";
import type {
  EvaluatedReturnLine,
  ReturnPolicyEvaluation,
  VerifiedOrderSnapshot
} from "@/server/returns/return-policy";
import { createPublicSessionToken, publicTokenHash } from "@/server/returns/return-security";
import { verifiedOrderSnapshotSchema } from "@/server/orderpro/returns-client";

const sessionTtlMs = 30 * 60_000;

export type VerifiedSessionRecord = {
  id: string;
  publicToken: string;
  orderReferenceHash: string;
  emailHash: string;
  postalCodeHash: string;
  orderProOrderId: string;
  expiresAt: Date;
  snapshot: VerifiedOrderSnapshot;
};

export type ReturnRequestRecord = {
  id: string;
  rmaNumber: string;
  orderProRmaId: string | null;
  verificationSessionId: string;
  idempotencyKey: string;
  requestHash: string;
  orderProOrderId: string;
  orderNumber: string;
  status: ReturnsStatus;
  policyVersion: string;
  businessTimeZone: string;
  currency: string;
  labelPayer: "COMPANY" | "CUSTOMER" | "PENDING_REVIEW";
  acceptedLabelDeductionCents: number;
  merchandiseRefundCents: number;
  estimatedTaxRefundCents: number;
  discountAdjustmentCents: number;
  refundableOriginalFeesCents: number;
  originalShippingCents: number;
  originalLocalDeliveryCents: number;
  estimatedNetRefundCents: number;
  shippoShipmentId: string | null;
  shippoRateId: string | null;
  shippoTransactionId: string | null;
  shippoCarrier: string | null;
  shippoServiceLevel: string | null;
  trackingNumber: string | null;
  labelCostCents: number | null;
  labelCurrency: string | null;
  privateLabelUrl: string | null;
  labelExpiresAt: Date | null;
  squarePaymentId: string | null;
  squareRefundId: string | null;
  squareRefundAmountCents: number | null;
  squareRefundCurrency: string | null;
  squareRefundStatus: string | null;
  finalApprovedRefundCents: number | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    orderLineId: string;
    name: string;
    variant: string | null;
    sku: string | null;
    upc: string | null;
    quantity: number;
    reason: string;
    decision: string;
    decisionReason: string | null;
    merchandiseRefundCents: number;
    estimatedTaxRefundCents: number;
  }>;
  events: Array<{
    status: ReturnsStatus;
    source: string;
    occurredAt: Date;
  }>;
};

export interface ReturnsRepository {
  createVerifiedSession(input: {
    orderReferenceHash: string;
    emailHash: string;
    postalCodeHash: string;
    snapshot: VerifiedOrderSnapshot;
    now?: Date;
  }): Promise<VerifiedSessionRecord>;
  readVerifiedSession(publicToken: string, now?: Date): Promise<VerifiedSessionRecord | null>;
  createRequest(input: CreateReturnRequestInput): Promise<{ record: ReturnRequestRecord; replayed: boolean }>;
  findRequestForSession(input: { sessionId: string; rmaNumber: string }): Promise<ReturnRequestRecord | null>;
  findRequestByOrderProRmaId(orderProRmaId: string): Promise<ReturnRequestRecord | null>;
  findRequestByTrackingNumber(trackingNumber: string): Promise<ReturnRequestRecord | null>;
  claimLabelPurchase(id: string): Promise<{ record: ReturnRequestRecord; claimed: boolean }>;
  updateLabel(input: UpdateReturnLabelInput): Promise<ReturnRequestRecord>;
  appendStatusEvent(input: AppendReturnStatusEventInput): Promise<{ record: ReturnRequestRecord; replayed: boolean }>;
  updateRefund(input: UpdateReturnRefundInput): Promise<ReturnRequestRecord>;
  applySquareRefundStatus(input: {
    squareRefundId: string;
    squareStatus: string;
  }): Promise<ReturnRequestRecord | null>;
}

export type CreateReturnRequestInput = {
  verificationSessionId: string;
  idempotencyKey: string;
  requestHash: string;
  rmaNumber: string;
  orderProRmaId: string;
  order: VerifiedOrderSnapshot;
  evaluation: ReturnPolicyEvaluation;
  acceptedLabelDeductionCents: number;
  estimatedNetRefundCents: number;
  quoteSnapshot: unknown;
  acceptedAt: Date;
  policyAccepted: boolean;
  conditionAccepted: boolean;
  labelDeductionAccepted: boolean;
};

export type UpdateReturnLabelInput = {
  id: string;
  status: "LABEL_CREATED" | "LABEL_PENDING" | "MANUAL_REVIEW";
  shippoShipmentId?: string | null;
  shippoRateId?: string | null;
  shippoTransactionId?: string | null;
  shippoCarrier?: string | null;
  shippoServiceLevel?: string | null;
  trackingNumber?: string | null;
  labelCostCents?: number | null;
  labelCurrency?: string | null;
  privateLabelUrl?: string | null;
  labelExpiresAt?: Date | null;
};

export type AppendReturnStatusEventInput = {
  requestId: string;
  status: ReturnsStatus;
  source: string;
  externalEventId: string;
  details?: unknown;
  occurredAt: Date;
};

export type UpdateReturnRefundInput = {
  id: string;
  status: "REFUND_PENDING" | "REFUNDED" | "EXCEPTION";
  finalApprovedRefundCents: number;
  squarePaymentId: string;
  squareRefundId: string | null;
  squareRefundAmountCents: number;
  squareRefundCurrency: string;
  squareRefundStatus: string;
};

type MemorySession = Omit<VerifiedSessionRecord, "publicToken"> & { publicTokenHash: string; publicToken: string };
type MemoryRequest = ReturnRequestRecord & { quoteSnapshot: unknown; requestLines: EvaluatedReturnLine[] };

export class InMemoryReturnsRepository implements ReturnsRepository {
  private readonly sessions = new Map<string, MemorySession>();
  private readonly requests = new Map<string, MemoryRequest>();
  private readonly eventKeys = new Set<string>();

  async createVerifiedSession(input: {
    orderReferenceHash: string;
    emailHash: string;
    postalCodeHash: string;
    snapshot: VerifiedOrderSnapshot;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const publicToken = createPublicSessionToken();
    const record: MemorySession = {
      id: `return-session-${this.sessions.size + 1}`,
      publicToken,
      publicTokenHash: publicTokenHash(publicToken),
      orderReferenceHash: input.orderReferenceHash,
      emailHash: input.emailHash,
      postalCodeHash: input.postalCodeHash,
      orderProOrderId: input.snapshot.orderProOrderId,
      expiresAt: new Date(now.getTime() + sessionTtlMs),
      snapshot: input.snapshot
    };
    this.sessions.set(record.publicTokenHash, record);
    return withoutSessionHash(record);
  }

  async readVerifiedSession(publicToken: string, now = new Date()) {
    const record = this.sessions.get(publicTokenHash(publicToken));
    if (!record || record.expiresAt <= now) return null;
    return withoutSessionHash(record);
  }

  async createRequest(input: CreateReturnRequestInput) {
    const existing = [...this.requests.values()].find((record) => record.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new ReturnRequestConflictError();
      return { record: existing, replayed: true };
    }
    assertAcceptedInput(input);
    const now = input.acceptedAt;
    const record: MemoryRequest = {
      id: `return-${this.requests.size + 1}`,
      rmaNumber: input.rmaNumber,
      orderProRmaId: input.orderProRmaId,
      verificationSessionId: input.verificationSessionId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      orderProOrderId: input.order.orderProOrderId,
      orderNumber: input.order.orderNumber,
      status: initialStatus(input.evaluation),
      policyVersion: input.evaluation.policyVersion,
      businessTimeZone: input.evaluation.businessTimeZone,
      currency: input.order.currency,
      labelPayer: input.evaluation.labelPayer,
      acceptedLabelDeductionCents: input.acceptedLabelDeductionCents,
      merchandiseRefundCents: input.evaluation.merchandiseRefundCents,
      estimatedTaxRefundCents: input.evaluation.estimatedTaxRefundCents,
      discountAdjustmentCents: input.evaluation.discountAdjustmentCents,
      refundableOriginalFeesCents: input.evaluation.refundableOriginalFeesCents,
      originalShippingCents: input.evaluation.originalShippingCents,
      originalLocalDeliveryCents: input.evaluation.originalLocalDeliveryCents,
      estimatedNetRefundCents: input.estimatedNetRefundCents,
      shippoShipmentId: null,
      shippoRateId: null,
      shippoTransactionId: null,
      shippoCarrier: null,
      shippoServiceLevel: null,
      trackingNumber: null,
      labelCostCents: null,
      labelCurrency: null,
      privateLabelUrl: null,
      labelExpiresAt: null,
      squarePaymentId: input.order.squarePaymentId,
      squareRefundId: null,
      squareRefundAmountCents: null,
      squareRefundCurrency: null,
      squareRefundStatus: null,
      finalApprovedRefundCents: null,
      createdAt: now,
      updatedAt: now,
      items: toPublicItems(input.evaluation.lines),
      events: [{ status: initialStatus(input.evaluation), source: "storefront", occurredAt: now }],
      quoteSnapshot: input.quoteSnapshot,
      requestLines: input.evaluation.lines
    };
    this.requests.set(record.id, record);
    return { record, replayed: false };
  }

  async findRequestForSession(input: { sessionId: string; rmaNumber: string }) {
    return [...this.requests.values()].find((record) =>
      record.verificationSessionId === input.sessionId &&
      record.rmaNumber.toUpperCase() === input.rmaNumber.toUpperCase()
    ) ?? null;
  }

  async findRequestByOrderProRmaId(orderProRmaId: string) {
    return [...this.requests.values()].find((record) => record.orderProRmaId === orderProRmaId) ?? null;
  }

  async findRequestByTrackingNumber(trackingNumber: string) {
    return [...this.requests.values()].find((record) => record.trackingNumber === trackingNumber) ?? null;
  }

  async updateLabel(input: UpdateReturnLabelInput) {
    const record = this.requireRequest(input.id);
    Object.assign(record, input, { updatedAt: new Date() });
    return record;
  }

  async claimLabelPurchase(id: string) {
    const record = this.requireRequest(id);
    if (record.status !== "AUTHORIZED" || record.shippoTransactionId) {
      return { record, claimed: false };
    }
    record.status = "LABEL_PENDING";
    record.updatedAt = new Date();
    return { record, claimed: true };
  }

  async appendStatusEvent(input: AppendReturnStatusEventInput) {
    const key = `${input.source}:${input.externalEventId}`;
    const record = this.requireRequest(input.requestId);
    if (this.eventKeys.has(key)) return { record, replayed: true };
    this.eventKeys.add(key);
    record.status = input.status;
    record.updatedAt = input.occurredAt;
    record.events.push({ status: input.status, source: input.source, occurredAt: input.occurredAt });
    return { record, replayed: false };
  }

  async updateRefund(input: UpdateReturnRefundInput) {
    const record = this.requireRequest(input.id);
    Object.assign(record, input, { updatedAt: new Date() });
    return record;
  }

  async applySquareRefundStatus(input: { squareRefundId: string; squareStatus: string }) {
    const record = [...this.requests.values()].find((candidate) => candidate.squareRefundId === input.squareRefundId);
    if (!record) return null;
    record.squareRefundStatus = input.squareStatus;
    record.status = input.squareStatus === "COMPLETED"
      ? "REFUNDED"
      : ["FAILED", "REJECTED"].includes(input.squareStatus)
        ? "EXCEPTION"
        : "REFUND_PENDING";
    record.updatedAt = new Date();
    return record;
  }

  private requireRequest(id: string) {
    const record = this.requests.get(id);
    if (!record) throw new Error("Return request does not exist.");
    return record;
  }
}

const developmentRepository = new InMemoryReturnsRepository();

const prismaRepository: ReturnsRepository = {
  async createVerifiedSession(input) {
    const now = input.now ?? new Date();
    const publicToken = createPublicSessionToken();
    try {
      const record = await getPrismaClient().returnVerificationSession.create({
        data: {
          publicTokenHash: publicTokenHash(publicToken),
          orderReferenceHash: input.orderReferenceHash,
          emailHash: input.emailHash,
          postalCodeHash: input.postalCodeHash,
          orderProOrderId: input.snapshot.orderProOrderId,
          verifiedAt: now,
          expiresAt: new Date(now.getTime() + sessionTtlMs),
          orderSnapshot: toPrismaJson(input.snapshot)
        }
      });
      return {
        id: record.id,
        publicToken,
        orderReferenceHash: record.orderReferenceHash,
        emailHash: record.emailHash,
        postalCodeHash: record.postalCodeHash,
        orderProOrderId: input.snapshot.orderProOrderId,
        expiresAt: record.expiresAt,
        snapshot: input.snapshot
      };
    } catch (error) {
      throw new PersistenceUnavailableError("Return verification", { cause: error });
    }
  },

  async readVerifiedSession(publicToken, now = new Date()) {
    try {
      const record = await getPrismaClient().returnVerificationSession.findFirst({
        where: {
          publicTokenHash: publicTokenHash(publicToken),
          verifiedAt: { not: null },
          expiresAt: { gt: now }
        }
      });
      if (!record?.orderSnapshot || !record.orderProOrderId) return null;
      return {
        id: record.id,
        publicToken,
        orderReferenceHash: record.orderReferenceHash,
        emailHash: record.emailHash,
        postalCodeHash: record.postalCodeHash,
        orderProOrderId: record.orderProOrderId,
        expiresAt: record.expiresAt,
        snapshot: verifiedOrderSnapshotSchema.parse(record.orderSnapshot)
      };
    } catch (error) {
      throw new PersistenceUnavailableError("Return verification", { cause: error });
    }
  },

  async createRequest(input) {
    assertAcceptedInput(input);
    const status = initialStatus(input.evaluation);
    try {
      try {
        const created = await getPrismaClient().returnRequest.create({
          data: {
            rmaNumber: input.rmaNumber,
            orderProRmaId: input.orderProRmaId,
            verificationSessionId: input.verificationSessionId,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            orderProOrderId: input.order.orderProOrderId,
            orderNumber: input.order.orderNumber,
            status,
            policyVersion: input.evaluation.policyVersion,
            businessTimeZone: input.evaluation.businessTimeZone,
            confirmedDeliveryAt: input.order.confirmedDeliveryAt
              ? new Date(input.order.confirmedDeliveryAt)
              : null,
            currency: input.order.currency,
            merchandiseRefundCents: input.evaluation.merchandiseRefundCents,
            estimatedTaxRefundCents: input.evaluation.estimatedTaxRefundCents,
            discountAdjustmentCents: input.evaluation.discountAdjustmentCents,
            refundableOriginalFeesCents: input.evaluation.refundableOriginalFeesCents,
            originalShippingCents: input.evaluation.originalShippingCents,
            originalLocalDeliveryCents: input.evaluation.originalLocalDeliveryCents,
            labelPayer: input.evaluation.labelPayer,
            acceptedLabelDeductionCents: input.acceptedLabelDeductionCents,
            estimatedNetRefundCents: input.estimatedNetRefundCents,
            quoteSnapshot: toPrismaJson(input.quoteSnapshot),
            policyAcceptedAt: input.acceptedAt,
            conditionAcceptedAt: input.acceptedAt,
            labelDeductionAcceptedAt: input.labelDeductionAccepted ? input.acceptedAt : null,
            squarePaymentId: input.order.squarePaymentId,
            items: {
              create: input.evaluation.lines.map((line) => ({
                orderLineId: line.line.orderLineId,
                squareVariationId: line.line.squareVariationId,
                sku: line.line.sku,
                upc: line.line.upc,
                name: line.line.name,
                variant: line.line.variant,
                quantity: line.selection.quantity,
                reason: line.selection.reason,
                customerComment: line.selection.comment,
                evidenceReferences: toPrismaJson(line.selection.evidenceReferences),
                decision: line.decision,
                decisionReason: line.decisionReason,
                declaredUnused: line.selection.declaredUnused,
                declaredOriginalPackaging: line.selection.declaredOriginalPackaging,
                declaredSealUnopened: line.selection.declaredSealUnopened,
                partyOpened: line.selection.partyOpened,
                merchandiseRefundCents: line.merchandiseRefundCents,
                estimatedTaxRefundCents: line.estimatedTaxRefundCents
              }))
            },
            events: {
              create: {
                status,
                source: "storefront",
                externalEventId: `created:${input.orderProRmaId}`,
                occurredAt: input.acceptedAt
              }
            }
          },
          include: returnRequestInclude
        });
        return { record: mapPrismaRequest(created), replayed: false };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const existing = await getPrismaClient().returnRequest.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: returnRequestInclude
        });
        if (!existing) throw error;
        if (existing.requestHash !== input.requestHash) throw new ReturnRequestConflictError();
        return { record: mapPrismaRequest(existing), replayed: true };
      }
    } catch (error) {
      if (error instanceof ReturnRequestConflictError) throw error;
      throw new PersistenceUnavailableError("Return request", { cause: error });
    }
  },

  async findRequestForSession(input) {
    try {
      const record = await getPrismaClient().returnRequest.findFirst({
        where: {
          verificationSessionId: input.sessionId,
          rmaNumber: { equals: input.rmaNumber, mode: "insensitive" }
        },
        include: returnRequestInclude
      });
      return record ? mapPrismaRequest(record) : null;
    } catch (error) {
      throw new PersistenceUnavailableError("Return request", { cause: error });
    }
  },

  async findRequestByOrderProRmaId(orderProRmaId) {
    try {
      const record = await getPrismaClient().returnRequest.findUnique({
        where: { orderProRmaId },
        include: returnRequestInclude
      });
      return record ? mapPrismaRequest(record) : null;
    } catch (error) {
      throw new PersistenceUnavailableError("Return request", { cause: error });
    }
  },

  async findRequestByTrackingNumber(trackingNumber) {
    try {
      const record = await getPrismaClient().returnRequest.findUnique({
        where: { trackingNumber },
        include: returnRequestInclude
      });
      return record ? mapPrismaRequest(record) : null;
    } catch (error) {
      throw new PersistenceUnavailableError("Return request", { cause: error });
    }
  },

  async updateLabel(input) {
    try {
      const { id, ...data } = input;
      const record = await getPrismaClient().returnRequest.update({
        where: { id },
        data,
        include: returnRequestInclude
      });
      return mapPrismaRequest(record);
    } catch (error) {
      throw new PersistenceUnavailableError("Return label", { cause: error });
    }
  },

  async claimLabelPurchase(id) {
    try {
      const update = await getPrismaClient().returnRequest.updateMany({
        where: { id, status: "AUTHORIZED", shippoTransactionId: null },
        data: { status: "LABEL_PENDING" }
      });
      const record = await getPrismaClient().returnRequest.findUniqueOrThrow({
        where: { id },
        include: returnRequestInclude
      });
      return { record: mapPrismaRequest(record), claimed: update.count === 1 };
    } catch (error) {
      throw new PersistenceUnavailableError("Return label", { cause: error });
    }
  },

  async appendStatusEvent(input) {
    try {
      try {
        const record = await getPrismaClient().$transaction(async (transaction) => {
          await transaction.returnStatusEvent.create({
            data: {
              returnRequestId: input.requestId,
              status: input.status,
              source: input.source,
              externalEventId: input.externalEventId,
              details: input.details === undefined ? undefined : toPrismaJson(input.details),
              occurredAt: input.occurredAt
            }
          });
          return transaction.returnRequest.update({
            where: { id: input.requestId },
            data: { status: input.status },
            include: returnRequestInclude
          });
        });
        return { record: mapPrismaRequest(record), replayed: false };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const existing = await getPrismaClient().returnRequest.findUniqueOrThrow({
          where: { id: input.requestId },
          include: returnRequestInclude
        });
        return { record: mapPrismaRequest(existing), replayed: true };
      }
    } catch (error) {
      throw new PersistenceUnavailableError("Return status", { cause: error });
    }
  },

  async updateRefund(input) {
    try {
      const { id, ...data } = input;
      const record = await getPrismaClient().returnRequest.update({
        where: { id },
        data,
        include: returnRequestInclude
      });
      return mapPrismaRequest(record);
    } catch (error) {
      throw new PersistenceUnavailableError("Return refund", { cause: error });
    }
  }
  ,

  async applySquareRefundStatus(input) {
    try {
      const existing = await getPrismaClient().returnRequest.findUnique({
        where: { squareRefundId: input.squareRefundId }
      });
      if (!existing) return null;
      const status = input.squareStatus === "COMPLETED"
        ? "REFUNDED" as const
        : ["FAILED", "REJECTED"].includes(input.squareStatus)
          ? "EXCEPTION" as const
          : "REFUND_PENDING" as const;
      const record = await getPrismaClient().returnRequest.update({
        where: { id: existing.id },
        data: { status, squareRefundStatus: input.squareStatus },
        include: returnRequestInclude
      });
      return mapPrismaRequest(record);
    } catch (error) {
      throw new PersistenceUnavailableError("Return refund", { cause: error });
    }
  }
};

const returnRequestInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { occurredAt: "asc" as const } }
};

export function getReturnsRepository(): ReturnsRepository {
  return requireDatabaseOrDevelopmentFallback("Returns") === "database"
    ? prismaRepository
    : developmentRepository;
}

function initialStatus(evaluation: ReturnPolicyEvaluation): ReturnsStatus {
  return evaluation.requiresManualReview ? "MANUAL_REVIEW" : "AUTHORIZED";
}

function assertAcceptedInput(input: CreateReturnRequestInput) {
  if (!input.policyAccepted || !input.conditionAccepted) {
    throw new ReturnRequestConflictError("Required acknowledgements were not accepted.");
  }
  if (
    input.evaluation.labelPayer === "CUSTOMER" &&
    (!input.labelDeductionAccepted || input.acceptedLabelDeductionCents <= 0)
  ) {
    throw new ReturnRequestConflictError("The return-label deduction was not accepted.");
  }
}

function mapPrismaRequest(record: {
  id: string;
  rmaNumber: string;
  orderProRmaId: string | null;
  verificationSessionId: string;
  idempotencyKey: string;
  requestHash: string;
  orderProOrderId: string;
  orderNumber: string;
  status: ReturnsStatus;
  policyVersion: string;
  businessTimeZone: string;
  currency: string;
  labelPayer: "COMPANY" | "CUSTOMER" | "PENDING_REVIEW";
  acceptedLabelDeductionCents: number;
  merchandiseRefundCents: number;
  estimatedTaxRefundCents: number;
  discountAdjustmentCents: number;
  refundableOriginalFeesCents: number;
  originalShippingCents: number;
  originalLocalDeliveryCents: number;
  estimatedNetRefundCents: number;
  shippoShipmentId: string | null;
  shippoRateId: string | null;
  shippoTransactionId: string | null;
  shippoCarrier: string | null;
  shippoServiceLevel: string | null;
  trackingNumber: string | null;
  labelCostCents: number | null;
  labelCurrency: string | null;
  privateLabelUrl: string | null;
  labelExpiresAt: Date | null;
  squarePaymentId: string | null;
  squareRefundId: string | null;
  squareRefundAmountCents: number | null;
  squareRefundCurrency: string | null;
  squareRefundStatus: string | null;
  finalApprovedRefundCents: number | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    orderLineId: string;
    name: string;
    variant: string | null;
    sku: string | null;
    upc: string | null;
    quantity: number;
    reason: string;
    decision: string;
    decisionReason: string | null;
    merchandiseRefundCents: number;
    estimatedTaxRefundCents: number;
  }>;
  events: Array<{ status: ReturnsStatus; source: string; occurredAt: Date }>;
}): ReturnRequestRecord {
  return record;
}

function toPublicItems(lines: EvaluatedReturnLine[]) {
  return lines.map((line) => ({
    orderLineId: line.line.orderLineId,
    name: line.line.name,
    variant: line.line.variant,
    sku: line.line.sku,
    upc: line.line.upc,
    quantity: line.selection.quantity,
    reason: line.selection.reason,
    decision: line.decision,
    decisionReason: line.decisionReason,
    merchandiseRefundCents: line.merchandiseRefundCents,
    estimatedTaxRefundCents: line.estimatedTaxRefundCents
  }));
}

function withoutSessionHash(record: MemorySession): VerifiedSessionRecord {
  return {
    id: record.id,
    publicToken: record.publicToken,
    orderReferenceHash: record.orderReferenceHash,
    emailHash: record.emailHash,
    postalCodeHash: record.postalCodeHash,
    orderProOrderId: record.orderProOrderId,
    expiresAt: record.expiresAt,
    snapshot: record.snapshot
  };
}

export class ReturnRequestConflictError extends Error {
  constructor(message = "This idempotency key was already used for a different return request.") {
    super(message);
    this.name = "ReturnRequestConflictError";
  }
}
