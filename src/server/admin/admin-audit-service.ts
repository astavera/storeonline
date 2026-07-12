import "server-only";

export type AdminAuditEvent = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
};

export function buildAdminAuditEvent(event: AdminAuditEvent) {
  return {
    ...event,
    createdAt: new Date().toISOString()
  };
}
