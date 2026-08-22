/**
 * Implements server-side admin audit service behavior and persistence boundaries.
 */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";
import { toPrismaJson } from "@/server/prisma-json";

export type AdminAuditEvent = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

export function buildAdminAuditEvent(event: AdminAuditEvent) {
  return {
    ...event,
    createdAt: new Date().toISOString()
  };
}

export async function recordAdminAuditEvent(event: AdminAuditEvent) {
  if (!process.env.DATABASE_URL) return false;

  try {
    const prisma = getPrismaClient();
    const actor = event.actorId
      ? await prisma.adminUser.findUnique({ where: { id: event.actorId }, select: { id: true } })
      : null;

    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        before: event.before === undefined ? undefined : toPrismaJson(event.before),
        after: event.after === undefined
          ? toPrismaJson({ actorSubject: event.actorId })
          : toPrismaJson({ actorSubject: event.actorId, value: event.after })
      }
    });
    return true;
  } catch (error) {
    console.warn("[admin-audit] Could not persist audit event.", error);
    return false;
  }
}
