/** Read-only Store Admin analytics built only from local operational mirrors. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";

export type AdminAnalyticsDataState = "available" | "partial" | "unavailable";

export type AdminAnalyticsDateRange = {
  from: string;
  to: string;
  startsAt: Date;
  endsAtExclusive: Date;
  label: string;
};

export type AdminAnalyticsRangeResult =
  | { ok: true; range: AdminAnalyticsDateRange }
  | {
      ok: false;
      code: "BOTH_DATES_REQUIRED" | "INVALID_DATE" | "RANGE_REVERSED" | "RANGE_TOO_LARGE" | "FUTURE_DATE";
      message: string;
    };

export type AdminAnalyticsMetric = {
  value: number | null;
  state: AdminAnalyticsDataState;
  note: string;
};

export type AdminAnalyticsDailyRow = {
  date: string;
  grossSalesCents: number;
  paidOrderCount: number;
  knownRefundCents: number;
  completedRefundCount: number;
  returnRequestCount: number;
};

export type AdminAnalyticsReport = {
  generatedAt: string;
  range: Omit<AdminAnalyticsDateRange, "startsAt" | "endsAtExclusive"> & {
    startsAt: string;
    endsAtExclusive: string;
    timeZone: "UTC";
  };
  currency: "USD";
  state: AdminAnalyticsDataState;
  metrics: {
    grossSalesCents: AdminAnalyticsMetric;
    netSalesCents: AdminAnalyticsMetric;
    paidOrderCount: AdminAnalyticsMetric;
    averageOrderValueCents: AdminAnalyticsMetric;
    returnRequestCount: AdminAnalyticsMetric;
    openReturnRequestCount: AdminAnalyticsMetric;
    completedRefundCount: AdminAnalyticsMetric;
    completedRefundCents: AdminAnalyticsMetric;
  };
  sources: Array<{
    id: "orders" | "returns" | "refunds";
    label: string;
    state: AdminAnalyticsDataState;
    note: string;
  }>;
  daily: AdminAnalyticsDailyRow[];
  excluded: string[];
};

export type AnalyticsOrderRecord = {
  id: string;
  squarePaymentId: string | null;
  totalMoney: unknown;
  status: string;
  createdAt: Date;
};

export type AnalyticsReturnRecord = {
  id: string;
  status: string;
  createdAt: Date;
};

export type AnalyticsRefundRecord = {
  id: string;
  squareRefundId: string | null;
  squareRefundAmountCents: number | null;
  squareRefundCurrency: string | null;
  squareRefundStatus: string | null;
  updatedAt: Date;
};

type AnalyticsRepositoryPage<T> = { records: T[]; truncated: boolean };

export type AdminAnalyticsRepository = {
  readOrders(range: AdminAnalyticsDateRange): Promise<AnalyticsRepositoryPage<AnalyticsOrderRecord>>;
  readReturns(range: AdminAnalyticsDateRange): Promise<AnalyticsRepositoryPage<AnalyticsReturnRecord>>;
  readRefunds(range: AdminAnalyticsDateRange): Promise<AnalyticsRepositoryPage<AnalyticsRefundRecord>>;
};

const maximumRangeDays = 366;
const maximumSourceRecords = 10_000;
const terminalReturnStatuses = new Set(["REFUNDED", "COMPLETED", "CANCELLED", "REJECTED"]);

function dateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function inputValue(input: URLSearchParams | { from?: string; to?: string }, key: "from" | "to") {
  return input instanceof URLSearchParams ? input.get(key) ?? undefined : input[key];
}

export function parseAdminAnalyticsDateRange(
  input: URLSearchParams | { from?: string; to?: string },
  now: Date = new Date()
): AdminAnalyticsRangeResult {
  const rawFrom = inputValue(input, "from")?.trim();
  const rawTo = inputValue(input, "to")?.trim();
  const today = dateOnly(now.toISOString().slice(0, 10))!;
  const defaultTo = today;
  const defaultFrom = addUtcDays(today, -29);

  if (Boolean(rawFrom) !== Boolean(rawTo)) {
    return { ok: false, code: "BOTH_DATES_REQUIRED", message: "Choose both a start date and an end date." };
  }
  const from = rawFrom ? dateOnly(rawFrom) : defaultFrom;
  const to = rawTo ? dateOnly(rawTo) : defaultTo;
  if (!from || !to) return { ok: false, code: "INVALID_DATE", message: "Dates must use the YYYY-MM-DD format." };
  if (from.getTime() > to.getTime()) {
    return { ok: false, code: "RANGE_REVERSED", message: "The start date must be on or before the end date." };
  }
  if (to.getTime() > today.getTime()) {
    return { ok: false, code: "FUTURE_DATE", message: "Analytics cannot include future dates." };
  }
  const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1_000)) + 1;
  if (inclusiveDays > maximumRangeDays) {
    return { ok: false, code: "RANGE_TOO_LARGE", message: `Analytics ranges are limited to ${maximumRangeDays} days.` };
  }

  return {
    ok: true,
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      startsAt: from,
      endsAtExclusive: addUtcDays(to, 1),
      label: `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`
    }
  };
}

type PrismaClient = ReturnType<typeof getPrismaClient>;

export function createPrismaAdminAnalyticsRepository(
  prisma?: PrismaClient
): AdminAnalyticsRepository {
  const client = () => prisma ?? getPrismaClient();
  return {
    async readOrders(range) {
      const records = await client().orderMirror.findMany({
        where: { createdAt: { gte: range.startsAt, lt: range.endsAtExclusive } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: maximumSourceRecords + 1,
        select: { id: true, squarePaymentId: true, totalMoney: true, status: true, createdAt: true }
      });
      return { records: records.slice(0, maximumSourceRecords), truncated: records.length > maximumSourceRecords };
    },
    async readReturns(range) {
      const records = await client().returnRequest.findMany({
        where: { createdAt: { gte: range.startsAt, lt: range.endsAtExclusive } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: maximumSourceRecords + 1,
        select: { id: true, status: true, createdAt: true }
      });
      return { records: records.slice(0, maximumSourceRecords), truncated: records.length > maximumSourceRecords };
    },
    async readRefunds(range) {
      const records = await client().returnRequest.findMany({
        where: {
          updatedAt: { gte: range.startsAt, lt: range.endsAtExclusive },
          squareRefundId: { not: null }
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: maximumSourceRecords + 1,
        select: {
          id: true,
          squareRefundId: true,
          squareRefundAmountCents: true,
          squareRefundCurrency: true,
          squareRefundStatus: true,
          updatedAt: true
        }
      });
      return { records: records.slice(0, maximumSourceRecords), truncated: records.length > maximumSourceRecords };
    }
  };
}

type SourceResult<T> =
  | { available: true; page: AnalyticsRepositoryPage<T> }
  | { available: false; page: null };

async function safeRead<T>(reader: () => Promise<AnalyticsRepositoryPage<T>>): Promise<SourceResult<T>> {
  try {
    return { available: true, page: await reader() };
  } catch {
    return { available: false, page: null };
  }
}

function mirrorMoney(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const money = value as Record<string, unknown>;
  if (money.currency !== "USD") return null;
  const amount = typeof money.amount === "number"
    ? money.amount
    : typeof money.amount === "string" && /^\d+$/.test(money.amount) ? Number(money.amount) : Number.NaN;
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function metric(value: number | null, state: AdminAnalyticsDataState, note: string): AdminAnalyticsMetric {
  return { value, state, note };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dailyRows(range: AdminAnalyticsDateRange) {
  const rows = new Map<string, AdminAnalyticsDailyRow>();
  for (let current = range.startsAt; current.getTime() < range.endsAtExclusive.getTime(); current = addUtcDays(current, 1)) {
    const date = dateKey(current);
    rows.set(date, { date, grossSalesCents: 0, paidOrderCount: 0, knownRefundCents: 0, completedRefundCount: 0, returnRequestCount: 0 });
  }
  return rows;
}

export async function readAdminAnalytics(
  range: AdminAnalyticsDateRange,
  dependencies: { repository?: AdminAnalyticsRepository; now?: () => Date } = {}
): Promise<AdminAnalyticsReport> {
  const repository = dependencies.repository ?? createPrismaAdminAnalyticsRepository();
  const [ordersSource, returnsSource, refundsSource] = await Promise.all([
    safeRead(() => repository.readOrders(range)),
    safeRead(() => repository.readReturns(range)),
    safeRead(() => repository.readRefunds(range))
  ]);
  const daily = dailyRows(range);

  const paidOrders = ordersSource.available
    ? ordersSource.page.records.filter((order) => Boolean(order.squarePaymentId))
    : [];
  const validPaidOrders = paidOrders.flatMap((order) => {
    const cents = mirrorMoney(order.totalMoney);
    return cents === null ? [] : [{ ...order, cents }];
  });
  for (const order of validPaidOrders) {
    const row = daily.get(dateKey(order.createdAt));
    if (row) row.grossSalesCents += order.cents;
  }
  for (const order of paidOrders) {
    const row = daily.get(dateKey(order.createdAt));
    if (row) row.paidOrderCount += 1;
  }
  const grossSalesCents = validPaidOrders.reduce((total, order) => total + order.cents, 0);
  const invalidPaidOrderTotals = paidOrders.length - validPaidOrders.length;
  const orderSourcePartial = ordersSource.available && (ordersSource.page.truncated || invalidPaidOrderTotals > 0);
  const orderState: AdminAnalyticsDataState = !ordersSource.available ? "unavailable" : orderSourcePartial ? "partial" : "available";

  const returnRequests = returnsSource.available ? returnsSource.page.records : [];
  for (const request of returnRequests) {
    const row = daily.get(dateKey(request.createdAt));
    if (row) row.returnRequestCount += 1;
  }
  const openReturns = returnRequests.filter((request) => !terminalReturnStatuses.has(request.status.toUpperCase()));
  const returnState: AdminAnalyticsDataState = !returnsSource.available
    ? "unavailable"
    : returnsSource.page.truncated ? "partial" : "available";

  const completedRefunds = refundsSource.available
    ? refundsSource.page.records.filter((refund) => refund.squareRefundStatus?.toUpperCase() === "COMPLETED")
    : [];
  const validRefunds = completedRefunds.filter((refund) =>
    refund.squareRefundId && refund.squareRefundCurrency === "USD" &&
    refund.squareRefundAmountCents !== null && Number.isSafeInteger(refund.squareRefundAmountCents) && refund.squareRefundAmountCents >= 0
  ) as Array<AnalyticsRefundRecord & { squareRefundAmountCents: number }>;
  for (const refund of validRefunds) {
    const row = daily.get(dateKey(refund.updatedAt));
    if (row) {
      row.knownRefundCents += refund.squareRefundAmountCents;
      row.completedRefundCount += 1;
    }
  }
  const completedRefundCents = validRefunds.reduce((total, refund) => total + refund.squareRefundAmountCents, 0);
  const invalidRefunds = completedRefunds.length - validRefunds.length;
  // The local RMA mirror cannot prove that it contains every Square refund, and
  // updatedAt is only the last locally recorded state rather than Square's ledger timestamp.
  const refundState: AdminAnalyticsDataState = refundsSource.available ? "partial" : "unavailable";
  const netState: AdminAnalyticsDataState = ordersSource.available && refundsSource.available ? "partial" : "unavailable";

  const availableSourceCount = [ordersSource, returnsSource, refundsSource].filter((source) => source.available).length;
  const reportState: AdminAnalyticsDataState = availableSourceCount === 0
    ? "unavailable"
    : "partial";
  const orderNote = !ordersSource.available
    ? "The local order mirror could not be read."
    : orderSourcePartial
      ? `${ordersSource.page.truncated ? "The safety limit was reached. " : ""}${invalidPaidOrderTotals} paid orders had unusable non-USD or invalid totals.`.trim()
      : "Paid orders are counted only when a local order has a Square payment ID; totals come from the stored USD order total.";
  const refundNote = !refundsSource.available
    ? "The local refund mirror could not be read."
    : `Known completed refunds from the website RMA mirror only; ${invalidRefunds} records had unusable amounts. Direct Square refunds may be absent.`;

  return {
    generatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    range: {
      from: range.from,
      to: range.to,
      startsAt: range.startsAt.toISOString(),
      endsAtExclusive: range.endsAtExclusive.toISOString(),
      label: range.label,
      timeZone: "UTC"
    },
    currency: "USD",
    state: reportState,
    metrics: {
      grossSalesCents: metric(ordersSource.available ? grossSalesCents : null, orderState, orderNote),
      netSalesCents: metric(netState === "unavailable" ? null : grossSalesCents - completedRefundCents, netState, "Gross mirrored order totals less known completed website RMA refunds. This is not a Square accounting statement."),
      paidOrderCount: metric(ordersSource.available ? paidOrders.length : null, ordersSource.available && ordersSource.page.truncated ? "partial" : orderState, orderNote),
      averageOrderValueCents: metric(
        ordersSource.available ? validPaidOrders.length > 0 ? Math.round(grossSalesCents / validPaidOrders.length) : 0 : null,
        orderState,
        invalidPaidOrderTotals > 0 ? "Average uses only paid orders with valid USD totals." : "Gross mirrored totals divided by paid mirrored orders."
      ),
      returnRequestCount: metric(returnsSource.available ? returnRequests.length : null, returnState, "Website return requests created during the selected period."),
      openReturnRequestCount: metric(returnsSource.available ? openReturns.length : null, returnState, "Return requests not in a terminal local workflow status."),
      completedRefundCount: metric(refundsSource.available ? validRefunds.length : null, refundState, refundNote),
      completedRefundCents: metric(refundsSource.available ? completedRefundCents : null, refundState, refundNote)
    },
    sources: [
      { id: "orders", label: "Local order mirror", state: orderState, note: orderNote },
      {
        id: "returns",
        label: "Website return workflow",
        state: returnState,
        note: !returnsSource.available ? "The return workflow could not be read." : returnsSource.page.truncated ? "The return safety limit was reached." : "Return counts come from local RMA records."
      },
      { id: "refunds", label: "RMA refund mirror", state: refundState, note: refundNote }
    ],
    daily: [...daily.values()],
    excluded: [
      "COGS and gross margin are not calculated because no authoritative cost ledger exists here.",
      "Marketing attribution is not calculated because no verified attribution source is connected.",
      "Direct Square refunds outside the website RMA mirror are not represented."
    ]
  };
}

export function createAdminAnalyticsCsv(report: AdminAnalyticsReport) {
  const headers = [
    "date",
    "gross_sales_cents",
    "paid_order_count",
    "known_refund_cents",
    "completed_refund_count",
    "return_request_count",
    "report_state"
  ];
  const rows = report.daily.map((row) => [
    row.date,
    row.grossSalesCents,
    row.paidOrderCount,
    row.knownRefundCents,
    row.completedRefundCount,
    row.returnRequestCount,
    report.state
  ]);
  return [headers, ...rows].map((row) => row.join(",")).join("\r\n");
}
