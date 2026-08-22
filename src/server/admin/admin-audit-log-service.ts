/**
 * Reads immutable administrative audit events with bounded filters and pagination.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";

const defaultPageSize = 25;
const maximumPageSize = 100;
const maximumFilterLength = 160;
const maximumSnapshotDepth = 8;
const maximumSnapshotEntries = 100;
const maximumSnapshotStringLength = 5_000;
const maximumCsvRows = 5_000;
const csvBatchSize = 250;
const maximumCsvCellLength = 20_000;
const sensitiveAuditKey = /(authorization|cookie|credential|mfa|password|recovery|secret|token|api.?key|private.?key|encryption.?key|session|challenge|code.?hash|email.?hash|postal.?hash|ip.?hash|private.?label.?url|webhook.?signature)/i;
const sensitiveAuditPiiKey = /(^|_)(address|email|phone|postal.?code|first.?name|last.?name)($|_)/i;

export type AdminAuditLogQuery = {
  page: number;
  pageSize: number;
  action: string;
  entityType: string;
  actor: string;
  from: string;
  to: string;
};

export type AdminAuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actor: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type AdminAuditLogResult = {
  entries: AdminAuditLogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
  };
};

export type AdminAuditCsvExport = {
  stream: ReadableStream<Uint8Array>;
  total: number;
  rowLimit: number;
  truncated: boolean;
};

type AdminAuditLogQueryInput = URLSearchParams | Record<string, string | string[] | undefined>;

export function parseAdminAuditLogQuery(input: AdminAuditLogQueryInput): AdminAuditLogQuery {
  return {
    page: readPositiveInteger(readQueryValue(input, "page")) ?? 1,
    pageSize: Math.min(readPositiveInteger(readQueryValue(input, "pageSize")) ?? defaultPageSize, maximumPageSize),
    action: readBoundedFilter(input, "action", 80),
    entityType: readBoundedFilter(input, "entityType", 80),
    actor: readBoundedFilter(input, "actor", maximumFilterLength),
    from: readIsoDate(readQueryValue(input, "from")),
    to: readIsoDate(readQueryValue(input, "to"))
  };
}

export async function readAdminAuditLog(query: AdminAuditLogQuery): Promise<AdminAuditLogResult> {
  const prisma = getPrismaClient();
  const where = buildAuditLogWhere(query);
  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const records = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      actorId: true,
      before: true,
      after: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      }
    }
  });

  return {
    entries: records.map((record) => ({
      ...record,
      before: sanitizeAuditSnapshot(record.before),
      after: sanitizeAuditSnapshot(record.after),
      createdAt: record.createdAt.toISOString()
    })),
    pagination: { page, pageSize: query.pageSize, pageCount, total }
  };
}

export async function createAdminAuditLogCsvExport(query: AdminAuditLogQuery): Promise<AdminAuditCsvExport> {
  const prisma = getPrismaClient();
  const where = buildAuditLogWhere(query);
  const total = await prisma.auditLog.count({ where });
  const rowLimit = Math.min(total, maximumCsvRows);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`\uFEFF${csvRow([
          "Timestamp UTC",
          "Actor ID",
          "Actor name",
          "Action",
          "Resource type",
          "Resource ID",
          "Before (redacted JSON)",
          "After (redacted JSON)"
        ])}\r\n`));

        let emitted = 0;
        let cursorId: string | undefined;
        while (emitted < rowLimit) {
          const records = await prisma.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            take: Math.min(csvBatchSize, rowLimit - emitted),
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              actorId: true,
              before: true,
              after: true,
              createdAt: true,
              actor: { select: { displayName: true } }
            }
          });
          if (records.length === 0) break;
          for (const record of records) {
            controller.enqueue(encoder.encode(`${csvRow([
              record.createdAt.toISOString(),
              record.actorId,
              record.actor?.displayName,
              record.action,
              record.entityType,
              record.entityId,
              snapshotForCsv(record.before),
              snapshotForCsv(record.after)
            ])}\r\n`));
          }
          emitted += records.length;
          cursorId = records.at(-1)?.id;
          if (!cursorId || records.length < Math.min(csvBatchSize, rowLimit - emitted + records.length)) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return { stream, total, rowLimit, truncated: total > maximumCsvRows };
}

export function encodeAdminAuditCsvCell(value: unknown): string {
  let normalized = value === null || value === undefined
    ? ""
    : typeof value === "string" ? value : JSON.stringify(value);
  normalized = normalized.replaceAll("\0", "");
  if (normalized.length > maximumCsvCellLength) {
    normalized = `${normalized.slice(0, maximumCsvCellLength)}… [truncated]`;
  }
  if (/^[\t\r\n ]*[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function sanitizeAuditSnapshot(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length > maximumSnapshotStringLength
      ? `${value.slice(0, maximumSnapshotStringLength)}… [truncated]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= maximumSnapshotDepth) return "[truncated: maximum depth]";
  if (Array.isArray(value)) {
    const values = value
      .slice(0, maximumSnapshotEntries)
      .map((entry) => sanitizeAuditSnapshot(entry, depth + 1));
    if (value.length > maximumSnapshotEntries) values.push(`[truncated: ${value.length - maximumSnapshotEntries} more entries]`);
    return values;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitized = Object.fromEntries(
      entries.slice(0, maximumSnapshotEntries).map(([key, entry]) => [
        key,
        sensitiveAuditKey.test(key) || sensitiveAuditPiiKey.test(key)
          ? "[REDACTED]"
          : sanitizeAuditSnapshot(entry, depth + 1)
      ])
    );
    if (entries.length > maximumSnapshotEntries) sanitized.__truncated__ = `${entries.length - maximumSnapshotEntries} more fields`;
    return sanitized;
  }
  return String(value);
}

function buildAuditLogWhere(query: AdminAuditLogQuery): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (query.action) where.action = { contains: query.action, mode: "insensitive" };
  if (query.entityType) where.entityType = { contains: query.entityType, mode: "insensitive" };
  if (query.actor) {
    where.OR = [
      { actorId: query.actor },
      { actor: { is: { email: { contains: query.actor, mode: "insensitive" } } } },
      { actor: { is: { displayName: { contains: query.actor, mode: "insensitive" } } } }
    ];
  }
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {})
    };
  }

  return where;
}

function csvRow(values: readonly unknown[]) {
  return values.map(encodeAdminAuditCsvCell).join(",");
}

function snapshotForCsv(value: unknown) {
  return JSON.stringify(sanitizeAuditSnapshot(value));
}

function readBoundedFilter(input: AdminAuditLogQueryInput, key: string, maximumLength: number) {
  return readQueryValue(input, key).trim().slice(0, maximumLength);
}

function readQueryValue(input: AdminAuditLogQueryInput, key: string) {
  if (input instanceof URLSearchParams) return input.get(key) ?? "";
  const value = input[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readPositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readIsoDate(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? "" : normalized;
}
