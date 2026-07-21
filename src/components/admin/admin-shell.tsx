/*
STORE AREA: Admin
SECTION: Admin Shell
SECTION ID: admin.shell
CUSTOMER-FACING: No
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Secure internal admin frame and navigation.
SAFE TO EDIT: Admin navigation labels and presentation.
DO NOT EDIT HERE: RBAC, auth session validation, audit logging, or mutation handlers.
RELATED FILES: src/app/(admin)/admin/layout.tsx
BUSINESS LOGIC FILES: src/lib/auth/admin-auth.ts, src/server/admin/admin-audit-service.ts
*/

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  PencilRuler,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const adminLinkGroups = [
  {
    label: "Current work",
    links: [
      ["Dashboard", "/admin"],
      ["Website Editor", "/admin/homepage"],
      ["Catalog Publishing", "/admin/product-placement"]
    ]
  }
] as const;

const adminLinkIcons: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  "Website Editor": PencilRuler,
  "Catalog Publishing": BarChart3
};

const catalogPublishingLinks = [
  ["Overview", "#overview"],
  ["Brands", "#structure-brands"],
  ["Categories", "#structure-categories"],
  ["Holidays", "#structure-holidays"],
  ["Products", "#products"],
  ["Real Catalog", "#catalog-test"],
  ["Bulk & Import", "#bulk"]
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHash = useSyncExternalStore(subscribeToHashChange, readCurrentHash, () => "#overview");
  const [catalogPublishingMenuOpen, setCatalogPublishingMenuOpen] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const flatLinks: Array<readonly [string, string]> = adminLinkGroups.flatMap((group) => group.links.map(([label, href]) => [label, href] as const));
  const isEditorPath = pathname?.startsWith("/admin/homepage") ?? false;
  const isCatalogPublishingPath = pathname?.startsWith("/admin/product-placement") ?? false;

  if (pathname === "/admin/login") return children;

  async function signOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-surface-muted lg:fixed lg:inset-0 lg:grid lg:h-screen lg:min-h-0 lg:overflow-clip",
        isEditorPath ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[260px_1fr]"
      )}
      data-store-area="Admin"
      data-store-component="AdminShell"
      data-store-section="admin.shell"
    >
      <aside className={cn("border-b border-border bg-surface p-4 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r", isEditorPath ? "lg:hidden" : "lg:p-5")}>
        <Link
          className={cn(
            "font-display text-lg font-semibold",
            isEditorPath && "lg:grid lg:h-11 lg:w-11 lg:place-items-center lg:rounded-md lg:border lg:border-border lg:bg-surface-muted lg:text-sm"
          )}
          href="/admin"
          title="Modern State Admin"
        >
          <span className={cn(isEditorPath && "lg:hidden")}>Modern State Admin</span>
          <span className={cn("hidden", isEditorPath && "lg:block")}>MS</span>
        </Link>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm lg:hidden" aria-label="Admin navigation">
          {flatLinks.map(([label, href]) => {
            const isCatalogLink = label === "Catalog Publishing";

            return (
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border" key={href}>
                <Link className="px-3 py-2 text-secondary hover:bg-surface-muted hover:text-primary" href={href}>
                  {label}
                </Link>
                {isCatalogLink && isCatalogPublishingPath ? (
                  <button
                    aria-expanded={catalogPublishingMenuOpen}
                    aria-label={`${catalogPublishingMenuOpen ? "Collapse" : "Expand"} Catalog Publishing menu`}
                    className="grid w-10 place-items-center border-l border-border text-secondary hover:bg-surface-muted hover:text-primary"
                    onClick={() => setCatalogPublishingMenuOpen((isOpen) => !isOpen)}
                    type="button"
                  >
                    <ChevronDown aria-hidden="true" className={cn("transition-transform", !catalogPublishingMenuOpen && "-rotate-90")} size={16} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </nav>
        {isCatalogPublishingPath && catalogPublishingMenuOpen ? (
          <nav aria-label="Catalog Publishing submenu" className="mt-2 flex gap-2 overflow-x-auto pb-1 text-sm lg:hidden">
            {catalogPublishingLinks.map(([label, hash]) => (
              <a
                aria-current={isCatalogHashActive(currentHash, hash) ? "page" : undefined}
                className={cn("shrink-0 rounded-md border px-3 py-2", isCatalogHashActive(currentHash, hash) ? "border-primary bg-primary text-white" : "border-border text-secondary")}
                href={hash}
                key={hash}
              >
                {label}
              </a>
            ))}
          </nav>
        ) : null}
        <nav className={cn("mt-8 hidden text-sm lg:grid", isEditorPath ? "gap-2" : "gap-6")} aria-label="Admin navigation">
          {isEditorPath
            ? flatLinks.map(([label, href]) => {
                const Icon = adminLinkIcons[label] ?? LayoutDashboard;
                const isActive = isActiveAdminHref(pathname, href);

                return (
                  <Link
                    aria-label={label}
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-md border transition",
                      isActive ? "border-primary bg-primary text-white" : "border-border text-secondary hover:border-primary hover:bg-surface-muted hover:text-primary"
                    )}
                    href={href}
                    key={href}
                    title={label}
                  >
                    <Icon aria-hidden="true" size={17} />
                  </Link>
                );
              })
            : adminLinkGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{group.label}</p>
                  <div className="mt-2 grid gap-1">
                    {group.links.map(([label, href]) => {
                      const isCatalogLink = label === "Catalog Publishing";
                      const isActive = isActiveAdminHref(pathname, href);

                      return (
                        <div key={href}>
                          <div className={cn("flex items-center overflow-hidden rounded-md", isActive && "bg-surface-muted text-primary")}>
                            <Link className={cn("min-w-0 flex-1 px-3 py-2 text-secondary hover:bg-surface-muted hover:text-primary", isActive && "text-primary")} href={href}>
                              {label}
                            </Link>
                            {isCatalogLink && isCatalogPublishingPath ? (
                              <button
                                aria-expanded={catalogPublishingMenuOpen}
                                aria-label={`${catalogPublishingMenuOpen ? "Collapse" : "Expand"} Catalog Publishing menu`}
                                className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded text-secondary hover:bg-surface hover:text-primary"
                                onClick={() => setCatalogPublishingMenuOpen((isOpen) => !isOpen)}
                                type="button"
                              >
                                <ChevronDown aria-hidden="true" className={cn("transition-transform", !catalogPublishingMenuOpen && "-rotate-90")} size={16} />
                              </button>
                            ) : null}
                          </div>
                          {isCatalogLink && isCatalogPublishingPath && catalogPublishingMenuOpen ? (
                            <div className="ml-3 mt-1 grid gap-0.5 border-l border-border pl-3">
                              {catalogPublishingLinks.map(([sectionLabel, hash]) => (
                                <a
                                  aria-current={isCatalogHashActive(currentHash, hash) ? "page" : undefined}
                                  className={cn(
                                    "rounded-md px-2 py-1.5 text-xs text-secondary hover:bg-surface-muted hover:text-primary",
                                    isCatalogHashActive(currentHash, hash) && "bg-primary text-white hover:bg-primary hover:text-white"
                                  )}
                                  href={hash}
                                  key={hash}
                                >
                                  {sectionLabel}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
        </nav>
        {!isEditorPath ? (
          <button className="mt-8 hidden min-h-10 w-full items-center justify-center rounded-md border border-border px-3 text-sm font-semibold text-secondary transition hover:bg-surface-muted hover:text-primary lg:inline-flex" disabled={isSigningOut} onClick={signOut} type="button">
            <LogOut aria-hidden="true" className="mr-2" size={16} />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        ) : null}
      </aside>
      <div className="lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden">{children}</div>
    </div>
  );
}

function subscribeToHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function readCurrentHash() {
  return window.location.hash || "#overview";
}

function isCatalogHashActive(currentHash: string, targetHash: string) {
  if (targetHash === "#overview") return !currentHash || currentHash === "#overview";
  return currentHash === targetHash || (targetHash === "#structure-brands" && currentHash === "#website-brands");
}

function isActiveAdminHref(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
