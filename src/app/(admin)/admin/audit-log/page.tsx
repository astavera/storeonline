/** Renders the authenticated, read-only administrative audit trail. */

import { AdminAuditLog } from "@/components/admin/admin-audit-log";
import {
  parseAdminAuditLogQuery,
  readAdminAuditLog,
  type AdminAuditLogResult
} from "@/server/admin/admin-audit-log-service";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AuditLogSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminAuditLogPage({
  searchParams
}: {
  searchParams?: Promise<AuditLogSearchParams>;
}) {
  const session = await requireAdminSession({ capability: "audit:read", returnTo: "/admin/audit-log" });
  const query = parseAdminAuditLogQuery((await searchParams) ?? {});
  let result: AdminAuditLogResult;
  let error: string | undefined;

  try {
    result = await readAdminAuditLog(query);
  } catch {
    result = emptyAuditLogResult(query.pageSize);
    error = "Confirm the database connection and try again.";
  }

  return <AdminAuditLog canExport={session.capabilities.includes("admin:*") || session.capabilities.includes("audit:export")} error={error} query={query} result={result} />;
}

function emptyAuditLogResult(pageSize: number): AdminAuditLogResult {
  return { entries: [], pagination: { page: 1, pageSize, pageCount: 1, total: 0 } };
}
