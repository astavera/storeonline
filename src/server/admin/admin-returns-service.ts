/** Read-only customer-support view over the local return workflow. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";

const returnRequestStatuses = new Set([
  "REQUESTED", "MANUAL_REVIEW", "AUTHORIZED", "LABEL_PENDING", "LABEL_CREATED", "DROPPED_OFF",
  "IN_TRANSIT", "DELIVERED_TO_WH01", "RECEIVED", "INSPECTING", "APPROVED", "PARTIALLY_APPROVED",
  "REJECTED", "REFUND_PENDING", "REFUNDED", "COMPLETED", "CANCELLED", "EXCEPTION"
]);

export type AdminReturnQueue = {
  available: boolean;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  statusCounts: Record<string, number>;
  requests: Array<{
    id: string;
    rmaNumber: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    estimatedNetRefundCents: number;
    finalApprovedRefundCents: number | null;
    currency: string;
    trackingNumber: string | null;
    carrier: string | null;
    itemCount: number;
    latestEvent: { status: string; source: string; occurredAt: string } | null;
  }>;
};

export async function readAdminReturnQueue(input: { q?: string; status?: string; page?: number; pageSize?: number }): Promise<AdminReturnQueue> {
  const pageSize = [10, 25, 50].includes(input.pageSize ?? 25) ? input.pageSize ?? 25 : 25;
  const requestedPage = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  if (!process.env.DATABASE_URL) return emptyQueue(requestedPage, pageSize);
  const q = input.q?.trim().slice(0, 100) ?? "";
  const requestedStatus = input.status?.trim().toUpperCase().slice(0, 60) ?? "";
  const status = returnRequestStatuses.has(requestedStatus) ? requestedStatus : "";
  const prisma = getPrismaClient();

  try {
    const where = {
      ...(status ? { status: status as never } : {}),
      ...(q ? { OR: [
        { rmaNumber: { contains: q, mode: "insensitive" as const } },
        { orderNumber: { contains: q, mode: "insensitive" as const } },
        { trackingNumber: { contains: q, mode: "insensitive" as const } }
      ] } : {})
    };
    const [total, grouped] = await Promise.all([
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.groupBy({ by: ["status"], _count: { _all: true } })
    ]);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const requests = await prisma.returnRequest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rmaNumber: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        estimatedNetRefundCents: true,
        finalApprovedRefundCents: true,
        currency: true,
        trackingNumber: true,
        shippoCarrier: true,
        _count: { select: { items: true } },
        events: { orderBy: { occurredAt: "desc" }, take: 1, select: { status: true, source: true, occurredAt: true } }
      }
    });
    return {
      available: true,
      page,
      pageSize,
      total,
      pageCount,
      statusCounts: Object.fromEntries(grouped.map((group) => [group.status, group._count._all])),
      requests: requests.map((request) => ({
        id: request.id,
        rmaNumber: request.rmaNumber,
        orderNumber: request.orderNumber,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        estimatedNetRefundCents: request.estimatedNetRefundCents,
        finalApprovedRefundCents: request.finalApprovedRefundCents,
        currency: request.currency,
        trackingNumber: request.trackingNumber,
        carrier: request.shippoCarrier,
        itemCount: request._count.items,
        latestEvent: request.events[0] ? { ...request.events[0], status: request.events[0].status, occurredAt: request.events[0].occurredAt.toISOString() } : null
      }))
    };
  } catch (error) {
    console.warn("[admin-returns] Could not read the return queue.", error);
    return emptyQueue(requestedPage, pageSize);
  }
}

function emptyQueue(page: number, pageSize: number): AdminReturnQueue {
  return { available: false, page, pageSize, total: 0, pageCount: 1, statusCounts: {}, requests: [] };
}
