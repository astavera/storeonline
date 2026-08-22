/**
 * Provides query-backed navigation between the Square catalog and website publishing.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export type AdminProductsTab = "catalog" | "publishing";

const tabs: ReadonlyArray<{
  id: AdminProductsTab;
  href: string;
  label: string;
}> = [
  { id: "catalog", href: "/admin/products", label: "Catalog" },
  { id: "publishing", href: "/admin/products?tab=publishing", label: "Website publishing" }
];

export function AdminProductsWorkspace({
  activeTab,
  children
}: {
  activeTab: AdminProductsTab;
  children: ReactNode;
}) {
  return (
    <div data-store-component="AdminProductsWorkspace">
      <AdminProductsNavigation activeTab={activeTab} />

      {children}
    </div>
  );
}

export function AdminProductsNavigation({ activeTab, action }: { activeTab: AdminProductsTab; action?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 pt-6">
      <div className="flex min-h-11 items-end justify-between gap-4 border-b border-border">
        <nav aria-label="Product workspace" className="flex min-h-11 gap-6">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-0.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-secondary hover:border-border hover:text-primary"
                }`}
                href={tab.href}
                key={tab.id}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        {action ? <div className="shrink-0 pb-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function resolveAdminProductsTab(value: string | string[] | undefined): AdminProductsTab {
  return value === "publishing" ? "publishing" : "catalog";
}
