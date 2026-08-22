/**
 * Builds a read-only sales and returns snapshot from Square and the local return workflow.
 */

import "server-only";

import {
  SquareClient,
  SquareEnvironment,
  type Location,
  type Payment,
  type PaymentRefund
} from "square";
import { env } from "@/lib/validation/env";
import { getPrismaClient } from "@/server/db/prisma";

export const adminOrderRanges = {
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" }
} as const;

export type AdminOrderRange = keyof typeof adminOrderRanges;

export type AdminOrdersAnalytics = {
  range: AdminOrderRange;
  rangeLabel: string;
  startsAt: string;
  endsAt: string;
  generatedAt: string;
  currency: "USD";
  source: "Square Payments";
  truncated: boolean;
  metrics: {
    grossSalesCents: number;
    netSalesCents: number;
    orderCount: number;
    averageOrderCents: number;
    completedRefundCents: number;
    completedRefundCount: number;
    pendingRefundCount: number;
    returnRequestCount: number;
    openReturnRequestCount: number;
    returnRate: number;
  };
  paymentMethods: AdminOrdersBreakdown[];
  locations: AdminOrdersBreakdown[];
  recentSales: AdminRecentSale[];
  recentRefunds: AdminRecentRefund[];
  recentReturnRequests: AdminRecentReturnRequest[];
  returnWorkflowAvailable: boolean;
};

export type AdminOrdersBreakdown = {
  key: string;
  label: string;
  salesCents: number;
  orderCount: number;
  share: number;
};

export type AdminRecentSale = {
  id: string;
  receiptNumber: string;
  createdAt: string;
  channel: string;
  location: string;
  paymentMethod: string;
  amountCents: number;
  refundedCents: number;
  status: string;
};

export type AdminRecentRefund = {
  id: string;
  createdAt: string;
  location: string;
  amountCents: number;
  status: string;
  reason: string | null;
};

export type AdminRecentReturnRequest = {
  id: string;
  rmaNumber: string;
  orderNumber: string;
  createdAt: string;
  amountCents: number;
  status: string;
};

type ReturnWorkflowSnapshot = {
  available: boolean;
  requests: AdminRecentReturnRequest[];
};

type BuildAnalyticsInput = {
  range: AdminOrderRange;
  startsAt: Date;
  endsAt: Date;
  payments: Payment[];
  refunds: PaymentRefund[];
  refundSourcePayments?: Payment[];
  locations: Location[];
  returnWorkflow: ReturnWorkflowSnapshot;
  truncated?: boolean;
};

const maxRecordsPerLocation = 5_000;
const terminalReturnStatuses = new Set(["COMPLETED", "CANCELLED", "REFUNDED"]);

export function readAdminOrderRange(value: string | null | undefined): AdminOrderRange {
  return value && value in adminOrderRanges ? value as AdminOrderRange : "30d";
}

export async function readAdminOrdersAnalytics(range: AdminOrderRange): Promise<AdminOrdersAnalytics> {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("Square payment reporting is not configured.");
  if (env.SQUARE_ENVIRONMENT === "production" && env.SQUARE_ALLOW_PRODUCTION_READONLY_SYNC !== "true") {
    throw new Error("Square production read-only access is not approved.");
  }

  const endsAt = new Date();
  const startsAt = new Date(endsAt.getTime() - adminOrderRanges[range].days * 24 * 60 * 60 * 1_000);
  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });

  const locationResponse = await client.locations.list();
  const locations = (locationResponse.locations ?? []).filter((location) => location.id && location.status !== "INACTIVE");
  const locationIds = locations.map((location) => location.id as string);
  const targets: Array<string | undefined> = locationIds.length > 0 ? locationIds : [undefined];

  const [paymentResults, refundResults, returnWorkflow] = await Promise.all([
    Promise.all(targets.map((locationId) => readPayments(client, startsAt, endsAt, locationId))),
    Promise.all(targets.map((locationId) => readRefunds(client, startsAt, endsAt, locationId))),
    readReturnWorkflow(startsAt)
  ]);
  const payments = uniqueById(paymentResults.flatMap((result) => result.records));
  const refunds = uniqueById(refundResults.flatMap((result) => result.records));
  const refundSourcePayments = await readMissingRefundPayments(client, payments, refunds);

  return buildAdminOrdersAnalytics({
    range,
    startsAt,
    endsAt,
    payments,
    refunds,
    refundSourcePayments,
    locations,
    returnWorkflow,
    truncated: [...paymentResults, ...refundResults].some((result) => result.truncated)
  });
}

export function buildAdminOrdersAnalytics(input: BuildAnalyticsInput): AdminOrdersAnalytics {
  const websitePayments = input.payments.filter(isWebsitePayment);
  const completedPayments = websitePayments
    .filter((payment) => payment.status === "COMPLETED")
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const websitePaymentReferences = new Map(
    [...websitePayments, ...(input.refundSourcePayments ?? []).filter(isWebsitePayment)]
      .filter((payment) => payment.id)
      .map((payment) => [payment.id as string, payment])
  );
  const websiteOrderIds = new Set([...websitePaymentReferences.values()].map((payment) => payment.orderId).filter(Boolean));
  const websiteRefunds = input.refunds.filter((refund) =>
    Boolean(refund.paymentId && websitePaymentReferences.has(refund.paymentId))
    || Boolean(refund.orderId && websiteOrderIds.has(refund.orderId))
  );
  const completedRefunds = websiteRefunds
    .filter((refund) => refund.status === "COMPLETED")
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const pendingRefunds = websiteRefunds.filter((refund) => refund.status === "PENDING");
  const grossSalesCents = completedPayments.reduce((total, payment) => total + moneyAmount(payment.amountMoney), 0);
  const completedRefundCents = completedRefunds.reduce((total, refund) => total + moneyAmount(refund.amountMoney), 0);
  const orderKeys = new Set(completedPayments.map((payment) => payment.orderId || payment.id).filter(Boolean));
  const orderCount = orderKeys.size;
  const locationNames = new Map(input.locations.filter((location) => location.id).map((location) => [location.id as string, location.name?.trim() || "Unnamed location"]));
  const refundPaymentIds = new Set(completedRefunds.map((refund) => refund.paymentId).filter(Boolean));
  const openReturnRequestCount = input.returnWorkflow.requests.filter((request) => !terminalReturnStatuses.has(request.status)).length;

  return {
    range: input.range,
    rangeLabel: adminOrderRanges[input.range].label,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    generatedAt: new Date().toISOString(),
    currency: "USD",
    source: "Square Payments",
    truncated: input.truncated === true,
    metrics: {
      grossSalesCents,
      netSalesCents: grossSalesCents - completedRefundCents,
      orderCount,
      averageOrderCents: orderCount > 0 ? Math.round(grossSalesCents / orderCount) : 0,
      completedRefundCents,
      completedRefundCount: completedRefunds.length,
      pendingRefundCount: pendingRefunds.length,
      returnRequestCount: input.returnWorkflow.requests.length,
      openReturnRequestCount,
      returnRate: orderCount > 0 ? refundPaymentIds.size / orderCount : 0
    },
    paymentMethods: buildBreakdown(completedPayments, grossSalesCents, (payment) => ({
      key: payment.sourceType?.toLowerCase() || "unknown",
      label: paymentMethodLabel(payment.sourceType)
    })),
    locations: buildBreakdown(completedPayments, grossSalesCents, (payment) => ({
      key: payment.locationId || "unknown",
      label: payment.locationId ? locationNames.get(payment.locationId) || "Unmapped Square location" : "No location"
    })),
    recentSales: completedPayments.slice(0, 12).map((payment) => ({
      id: payment.id || payment.orderId || "unidentified-payment",
      receiptNumber: payment.receiptNumber || shortReference(payment.orderId || payment.id),
      createdAt: payment.createdAt || input.endsAt.toISOString(),
      channel: "Website",
      location: payment.locationId ? locationNames.get(payment.locationId) || "Unmapped Square location" : "No location",
      paymentMethod: paymentMethodLabel(payment.sourceType),
      amountCents: moneyAmount(payment.amountMoney),
      refundedCents: moneyAmount(payment.refundedMoney),
      status: payment.status || "UNKNOWN"
    })),
    recentRefunds: [...websiteRefunds]
      .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
      .slice(0, 8)
      .map((refund) => ({
        id: refund.id,
        createdAt: refund.createdAt || input.endsAt.toISOString(),
        location: refund.locationId ? locationNames.get(refund.locationId) || "Unmapped Square location" : "No location",
        amountCents: moneyAmount(refund.amountMoney),
        status: refund.status || "UNKNOWN",
        reason: refund.reason?.trim() || null
      })),
    recentReturnRequests: input.returnWorkflow.requests.slice(0, 8),
    returnWorkflowAvailable: input.returnWorkflow.available
  };
}

async function readPayments(client: SquareClient, startsAt: Date, endsAt: Date, locationId?: string) {
  const page = await client.payments.list({
    beginTime: startsAt.toISOString(),
    endTime: endsAt.toISOString(),
    sortOrder: "DESC",
    limit: 100,
    ...(locationId ? { locationId } : {})
  });
  return readPage(page, maxRecordsPerLocation);
}

async function readRefunds(client: SquareClient, startsAt: Date, endsAt: Date, locationId?: string) {
  const page = await client.refunds.list({
    beginTime: startsAt.toISOString(),
    endTime: endsAt.toISOString(),
    sortOrder: "DESC",
    limit: 100,
    ...(locationId ? { locationId } : {})
  });
  return readPage(page, maxRecordsPerLocation);
}

async function readMissingRefundPayments(client: SquareClient, payments: Payment[], refunds: PaymentRefund[]) {
  const knownPaymentIds = new Set(payments.map((payment) => payment.id).filter(Boolean));
  const missingPaymentIds = [...new Set(
    refunds
      .map((refund) => refund.paymentId)
      .filter((id): id is string => typeof id === "string" && id.length > 0 && !knownPaymentIds.has(id))
  )].slice(0, 500);
  const records: Payment[] = [];

  for (let index = 0; index < missingPaymentIds.length; index += 10) {
    const batch = missingPaymentIds.slice(index, index + 10);
    const results = await Promise.all(batch.map(async (paymentId) => {
      try {
        const response = await client.payments.get({ paymentId });
        return response.payment ?? null;
      } catch {
        return null;
      }
    }));
    records.push(...results.filter((payment): payment is Payment => payment !== null));
  }

  return records;
}

async function readPage<T>(page: { data: T[]; hasNextPage(): boolean; getNextPage(): Promise<unknown> }, limit: number) {
  const records: T[] = [];
  for (;;) {
    records.push(...page.data.slice(0, Math.max(0, limit - records.length)));
    if (records.length >= limit || !page.hasNextPage()) break;
    await page.getNextPage();
  }
  return { records, truncated: records.length >= limit && page.hasNextPage() };
}

async function readReturnWorkflow(startsAt: Date): Promise<ReturnWorkflowSnapshot> {
  try {
    const requests = await getPrismaClient().returnRequest.findMany({
      where: { createdAt: { gte: startsAt } },
      orderBy: { createdAt: "desc" },
      take: 2_000,
      select: {
        id: true,
        rmaNumber: true,
        orderNumber: true,
        createdAt: true,
        finalApprovedRefundCents: true,
        estimatedNetRefundCents: true,
        status: true
      }
    });
    return {
      available: true,
      requests: requests.map((request) => ({
        id: request.id,
        rmaNumber: request.rmaNumber,
        orderNumber: request.orderNumber,
        createdAt: request.createdAt.toISOString(),
        amountCents: request.finalApprovedRefundCents ?? request.estimatedNetRefundCents,
        status: request.status
      }))
    };
  } catch {
    return { available: false, requests: [] };
  }
}

function buildBreakdown(
  payments: Payment[],
  grossSalesCents: number,
  classify: (payment: Payment) => { key: string; label: string }
): AdminOrdersBreakdown[] {
  const groups = new Map<string, Omit<AdminOrdersBreakdown, "orderCount" | "share"> & { orderKeys: Set<string> }>();
  for (const [index, payment] of payments.entries()) {
    const classification = classify(payment);
    const current = groups.get(classification.key) ?? {
      ...classification,
      salesCents: 0,
      orderKeys: new Set<string>()
    };
    current.salesCents += moneyAmount(payment.amountMoney);
    current.orderKeys.add(payment.orderId || payment.id || `unidentified-payment-${index}`);
    groups.set(classification.key, current);
  }
  return [...groups.values()]
    .map(({ orderKeys, ...group }) => ({
      ...group,
      orderCount: orderKeys.size,
      share: grossSalesCents > 0 ? group.salesCents / grossSalesCents : 0
    }))
    .sort((left, right) => right.salesCents - left.salesCents);
}

function isWebsitePayment(payment: Payment) {
  const note = payment.note?.trim().toLowerCase() || "";
  if (note.startsWith("modern state website order")) return true;
  if (env.SQUARE_APPLICATION_ID && payment.applicationDetails?.applicationId === env.SQUARE_APPLICATION_ID) return true;
  return payment.applicationDetails?.squareProduct === "ECOMMERCE_API";
}

function paymentMethodLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    BANK_ACCOUNT: "Bank account",
    BUY_NOW_PAY_LATER: "Buy now, pay later",
    CARD: "Card",
    CASH: "Cash",
    EXTERNAL: "External",
    SQUARE_ACCOUNT: "Square account",
    WALLET: "Wallet"
  };
  return value ? labels[value] || titleCase(value) : "Unknown";
}

function moneyAmount(money: { amount?: bigint | null; currency?: string } | null | undefined) {
  if (!money || money.currency && money.currency !== "USD" || money.amount === null || money.amount === undefined) return 0;
  const amount = Number(money.amount);
  return Number.isSafeInteger(amount) ? amount : 0;
}

function uniqueById<T extends { id?: string }>(records: T[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record.id) return true;
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function timestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortReference(value: string | undefined) {
  if (!value) return "No receipt";
  return value.length > 12 ? `...${value.slice(-8)}` : value;
}

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
