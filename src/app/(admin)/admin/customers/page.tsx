/** Server-rendered, permission-scoped customer support directory. */

import { AdminCustomerDirectory } from "@/components/admin/admin-customer-directory";
import {
  parseAdminCustomerQuery,
  readAdminCustomerDirectory,
  type AdminCustomerDirectoryResult
} from "@/server/admin/admin-customer-directory-service";
import { readAdminCustomerPrivacyProfile, type AdminCustomerPrivacyProfile } from "@/server/admin/admin-customer-privacy-service";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CustomerSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminCustomersPage({
  searchParams
}: {
  searchParams?: Promise<CustomerSearchParams>;
}) {
  const session = await requireAdminSession({ capability: "customers:read", returnTo: "/admin/customers" });
  const rawParams = (await searchParams) ?? {};
  const query = parseAdminCustomerQuery(rawParams);
  let result: AdminCustomerDirectoryResult;
  let selectedProfile: AdminCustomerPrivacyProfile | null = null;
  let error: string | undefined;

  try {
    result = await readAdminCustomerDirectory(query);
    const customerId = typeof rawParams.customerId === "string" ? rawParams.customerId.trim().slice(0, 100) : "";
    if (customerId) selectedProfile = await readAdminCustomerPrivacyProfile(customerId);
  } catch {
    result = emptyCustomerDirectory(query.pageSize);
    error = "Confirm the database connection and try again.";
  }

  return <AdminCustomerDirectory canNote={session.capabilities.includes("admin:*") || session.capabilities.includes("customers:notes.write")} canPrivacy={session.capabilities.includes("admin:*") || session.capabilities.includes("customers:privacy.manage")} error={error} query={query} result={result} selectedProfile={selectedProfile} />;
}

function emptyCustomerDirectory(pageSize: number): AdminCustomerDirectoryResult {
  return {
    customers: [],
    countSources: { orders: "LOCAL_ORDER_EMAIL_MATCH", returns: "UNAVAILABLE" },
    pagination: { page: 1, pageSize, pageCount: 1, total: 0 }
  };
}
