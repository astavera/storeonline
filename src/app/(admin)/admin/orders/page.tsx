/**
 * Provides the authenticated read-only sales and returns dashboard.
 */

import { AdminOrdersDashboard } from "@/components/admin/admin-orders-dashboard";
import { AdminOrdersTabs, readAdminOrdersTab } from "@/components/admin/admin-orders-tabs";
import { AdminReturnsQueue, type AdminReturnsQuery } from "@/components/admin/admin-returns-queue";
import { requireAdminSession } from "@/server/admin/admin-session";
import { readAdminReturnQueue } from "@/server/admin/admin-returns-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOrdersPage({ searchParams }: { searchParams?: Promise<AdminReturnsQuery & { tab?: string }> }) {
  const params = await searchParams ?? {};
  const activeTab = readAdminOrdersTab(params.tab);
  const capability = activeTab === "returns" ? "returns:read" : "orders:read";
  const returnTo = activeTab === "returns" ? "/admin/orders?tab=returns" : "/admin/orders";
  const session = await requireAdminSession({ capability, returnTo });
  const canReadOrders = hasCapability(session.capabilities, "orders:read");
  const canReadReturns = hasCapability(session.capabilities, "returns:read");

  if (activeTab === "returns") {
    const queue = await readAdminReturnQueue({ q: params.q, status: params.status, page: Number(params.page || 1) });
    return <><AdminOrdersTabs activeTab="returns" canReadOrders={canReadOrders} canReadReturns={canReadReturns} /><div aria-labelledby="admin-orders-tab-returns" id="admin-orders-panel-returns" role="tabpanel"><AdminReturnsQueue params={params} queue={queue} /></div></>;
  }

  return <><AdminOrdersTabs activeTab="orders" canReadOrders={canReadOrders} canReadReturns={canReadReturns} /><div aria-labelledby="admin-orders-tab-orders" id="admin-orders-panel-orders" role="tabpanel"><AdminOrdersDashboard orderProUrl={process.env.ORDERPRO_ADMIN_URL} /></div></>;
}

function hasCapability(capabilities: readonly string[], capability: string) {
  return capabilities.includes("admin:*") || capabilities.includes(capability);
}
