/** Read-only, privacy-minimized customer directory for Store Admin support. */

import "server-only";

import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";

const defaultPageSize = 25;
const maximumPageSize = 50;
const maximumSearchLength = 160;

export const adminCustomerConsentFilters = ["all", "marketing-granted", "marketing-denied", "unsubscribed"] as const;
export const adminCustomerSorts = ["recent", "name", "last-login"] as const;

export type AdminCustomerConsentFilter = (typeof adminCustomerConsentFilters)[number];
export type AdminCustomerSort = (typeof adminCustomerSorts)[number];

export type AdminCustomerQuery = {
  page: number;
  pageSize: number;
  search: string;
  consent: AdminCustomerConsentFilter;
  sort: AdminCustomerSort;
};

export type AdminCustomerSummary = {
  id: string;
  email: string;
  displayName: string;
  squareProfileLinked: boolean;
  terms: {
    acceptedAt: string;
    version: string;
  };
  marketing: {
    status: "OPTED_IN" | "OPTED_OUT" | "UNSUBSCRIBED";
    consentAt: string | null;
    unsubscribedAt: string | null;
    version: string | null;
  };
  privacy: {
    consentEventCount: number;
    recentConsentEvents: Array<{
      id: string;
      type: string;
      granted: boolean;
      source: string;
      policyVersion: string;
      occurredAt: string;
    }>;
  };
  activity: {
    localOrderCount: number;
    returnRequestCount: number | null;
    lastLoginAt: string | null;
    customerSince: string;
  };
};

export type AdminCustomerDirectoryResult = {
  customers: AdminCustomerSummary[];
  countSources: {
    orders: "LOCAL_ORDER_EMAIL_MATCH";
    returns: "RETURN_EMAIL_HASH" | "UNAVAILABLE";
  };
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
  };
};

type AdminCustomerQueryInput = URLSearchParams | Record<string, string | string[] | undefined>;

type CustomerDirectoryRecord = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  squareCustomerId: string | null;
  termsAcceptedAt: Date;
  termsVersion: string;
  marketingEmailConsent: boolean;
  marketingConsentAt: Date | null;
  marketingConsentVersion: string | null;
  marketingUnsubscribedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  consentEvents: Array<{
    id: string;
    consentType: string;
    granted: boolean;
    source: string;
    policyVersion: string;
    occurredAt: Date;
  }>;
  _count: { consentEvents: number };
};

export function parseAdminCustomerQuery(input: AdminCustomerQueryInput): AdminCustomerQuery {
  const consentValue = readQueryValue(input, "consent");
  const sortValue = readQueryValue(input, "sort");
  return {
    page: readPositiveInteger(readQueryValue(input, "page")) ?? 1,
    pageSize: Math.min(readPositiveInteger(readQueryValue(input, "pageSize")) ?? defaultPageSize, maximumPageSize),
    search: readQueryValue(input, "search").trim().slice(0, maximumSearchLength),
    consent: adminCustomerConsentFilters.includes(consentValue as AdminCustomerConsentFilter)
      ? consentValue as AdminCustomerConsentFilter
      : "all",
    sort: adminCustomerSorts.includes(sortValue as AdminCustomerSort)
      ? sortValue as AdminCustomerSort
      : "recent"
  };
}

export async function readAdminCustomerDirectory(
  query: AdminCustomerQuery,
  prisma: PrismaClient = getPrismaClient()
): Promise<AdminCustomerDirectoryResult> {
  const where = buildCustomerWhere(query);
  const total = await prisma.customerAccount.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const records = await prisma.customerAccount.findMany({
    where,
    orderBy: buildCustomerOrder(query.sort),
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      squareCustomerId: true,
      termsAcceptedAt: true,
      termsVersion: true,
      marketingEmailConsent: true,
      marketingConsentAt: true,
      marketingConsentVersion: true,
      marketingUnsubscribedAt: true,
      lastLoginAt: true,
      createdAt: true,
      consentEvents: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          consentType: true,
          granted: true,
          source: true,
          policyVersion: true,
          occurredAt: true
        }
      },
      _count: { select: { consentEvents: true } }
    }
  });

  const emails = [...new Set(records.map((record) => record.email.toLowerCase()))];
  const orderCounts = await readLocalOrderCounts(prisma, emails);
  const returnsSecret = validReturnsSecret(process.env.RETURNS_SESSION_SECRET);
  const returnCounts = returnsSecret
    ? await readReturnRequestCounts(prisma, emails, returnsSecret)
    : null;

  return {
    customers: buildAdminCustomerSummaries(records, orderCounts, returnCounts),
    countSources: {
      orders: "LOCAL_ORDER_EMAIL_MATCH",
      returns: returnCounts ? "RETURN_EMAIL_HASH" : "UNAVAILABLE"
    },
    pagination: { page, pageSize: query.pageSize, pageCount, total }
  };
}

export function buildAdminCustomerSummaries(
  records: readonly CustomerDirectoryRecord[],
  orderCounts: ReadonlyMap<string, number>,
  returnCounts: ReadonlyMap<string, number> | null
): AdminCustomerSummary[] {
  return records.map((record) => {
    const emailKey = record.email.toLowerCase();
    return {
      id: record.id,
      email: record.email,
      displayName: [record.firstName, record.lastName].filter(Boolean).join(" ") || "No name provided",
      squareProfileLinked: Boolean(record.squareCustomerId),
      terms: {
        acceptedAt: record.termsAcceptedAt.toISOString(),
        version: record.termsVersion
      },
      marketing: {
        status: record.marketingUnsubscribedAt
          ? "UNSUBSCRIBED"
          : record.marketingEmailConsent ? "OPTED_IN" : "OPTED_OUT",
        consentAt: record.marketingConsentAt?.toISOString() ?? null,
        unsubscribedAt: record.marketingUnsubscribedAt?.toISOString() ?? null,
        version: record.marketingConsentVersion
      },
      privacy: {
        consentEventCount: record._count.consentEvents,
        recentConsentEvents: record.consentEvents.map((event) => ({
          id: event.id,
          type: event.consentType,
          granted: event.granted,
          source: event.source,
          policyVersion: event.policyVersion,
          occurredAt: event.occurredAt.toISOString()
        }))
      },
      activity: {
        localOrderCount: orderCounts.get(emailKey) ?? 0,
        returnRequestCount: returnCounts?.get(emailKey) ?? (returnCounts ? 0 : null),
        lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
        customerSince: record.createdAt.toISOString()
      }
    };
  });
}

async function readLocalOrderCounts(prisma: PrismaClient, emails: readonly string[]) {
  if (emails.length === 0) return new Map<string, number>();
  const groups = await prisma.orderMirror.groupBy({
    by: ["customerEmail"],
    where: {
      customerEmail: { not: null },
      OR: emails.map((email) => ({ customerEmail: { equals: email, mode: "insensitive" as const } }))
    },
    _count: { _all: true }
  });
  const counts = new Map<string, number>();
  for (const group of groups) {
    if (!group.customerEmail) continue;
    const email = group.customerEmail.toLowerCase();
    counts.set(email, (counts.get(email) ?? 0) + group._count._all);
  }
  return counts;
}

async function readReturnRequestCounts(prisma: PrismaClient, emails: readonly string[], secret: string) {
  if (emails.length === 0) return new Map<string, number>();
  const emailByHash = new Map(emails.map((email) => [hashReturnEmail(email, secret), email]));
  const sessions = await prisma.returnVerificationSession.findMany({
    where: { emailHash: { in: [...emailByHash.keys()] } },
    select: { emailHash: true, _count: { select: { requests: true } } }
  });
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const email = emailByHash.get(session.emailHash);
    if (email) counts.set(email, (counts.get(email) ?? 0) + session._count.requests);
  }
  return counts;
}

function buildCustomerWhere(query: AdminCustomerQuery): Prisma.CustomerAccountWhereInput {
  const where: Prisma.CustomerAccountWhereInput = {};
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: "insensitive" } },
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } }
    ];
  }
  if (query.consent === "marketing-granted") {
    where.marketingEmailConsent = true;
    where.marketingUnsubscribedAt = null;
  } else if (query.consent === "marketing-denied") {
    where.marketingEmailConsent = false;
    where.marketingUnsubscribedAt = null;
  } else if (query.consent === "unsubscribed") {
    where.marketingUnsubscribedAt = { not: null };
  }
  return where;
}

function buildCustomerOrder(sort: AdminCustomerSort): Prisma.CustomerAccountOrderByWithRelationInput[] {
  if (sort === "name") return [{ lastName: { sort: "asc", nulls: "last" } }, { firstName: { sort: "asc", nulls: "last" } }, { email: "asc" }];
  if (sort === "last-login") return [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

function hashReturnEmail(email: string, secret: string) {
  return createHmac("sha256", secret).update(email.trim().toLowerCase(), "utf8").digest("hex");
}

function validReturnsSecret(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && Buffer.byteLength(normalized, "utf8") >= 32 ? normalized : null;
}

function readQueryValue(input: AdminCustomerQueryInput, key: string) {
  if (input instanceof URLSearchParams) return input.get(key) ?? "";
  const value = input[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readPositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
