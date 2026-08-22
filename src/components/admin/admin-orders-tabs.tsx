/** Accessible route-backed tabs for the consolidated Orders workspace. */

import Link from "next/link";

export type AdminOrdersTab = "orders" | "returns";

export function readAdminOrdersTab(value: string | undefined): AdminOrdersTab {
  return value === "returns" ? "returns" : "orders";
}

export function AdminOrdersTabs({ activeTab, canReadOrders, canReadReturns }: {
  activeTab: AdminOrdersTab;
  canReadOrders: boolean;
  canReadReturns: boolean;
}) {
  const tabs = [
    ...(canReadOrders ? [{ id: "orders" as const, label: "Orders", href: "/admin/orders" }] : []),
    ...(canReadReturns ? [{ id: "returns" as const, label: "Returns", href: "/admin/orders?tab=returns" }] : [])
  ];

  return (
    <nav aria-label="Orders workspace" className="border-b border-border bg-white px-5 pt-3 sm:px-7" role="tablist">
      <div className="flex min-h-12 gap-6">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              aria-controls={`admin-orders-panel-${tab.id}`}
              aria-selected={active}
              className={active ? "inline-flex items-center border-b-2 border-primary px-1 text-sm font-semibold text-primary" : "inline-flex items-center border-b-2 border-transparent px-1 text-sm font-semibold text-secondary hover:text-primary"}
              href={tab.href}
              id={`admin-orders-tab-${tab.id}`}
              key={tab.id}
              role="tab"
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
