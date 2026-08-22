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
BUSINESS LOGIC FILES: src/server/admin/admin-security.ts, src/server/admin/admin-audit-service.ts
*/

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowUpRight,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  PanelsTopLeft,
  Send,
  ShoppingBag,
  Truck,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminNavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type AdminNavGroup = {
  label: string;
  links: AdminNavLink[];
};

const adminLinkGroups: AdminNavGroup[] = [
  {
    label: "Workspace",
    links: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Products", href: "/admin/products", icon: PackageSearch },
      { label: "Website Editor", href: "/admin/homepage", icon: PanelsTopLeft },
      { label: "Catalog Publishing", href: "/admin/product-placement", icon: Send }
    ]
  },
  {
    label: "Operations",
    links: [
      { label: "Inventory", href: "/admin/inventory", icon: Boxes },
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Fulfillment", href: "/admin/fulfillment", icon: Truck }
    ]
  }
];

const adminPreviewLinkGroups: AdminNavGroup[] = [
  {
    label: "Preview tools",
    links: [
      { label: "Website Editor", href: "/admin/homepage", icon: PanelsTopLeft },
      { label: "Catalog Browser", href: "/admin/catalog", icon: Boxes }
    ]
  }
];

const catalogPublishingLinks = [
  ["Overview", "#overview"],
  ["Brands", "#structure-brands"],
  ["Categories", "#structure-categories"],
  ["Party", "#structure-party"],
  ["Holidays", "#structure-holidays"],
  ["Products", "#products"],
  ["Bulk & Import", "#bulk"]
] as const;

export function AdminShell({ adminPreview = false, children }: { adminPreview?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHash = useSyncExternalStore(subscribeToHashChange, readCurrentHash, () => "#overview");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const visibleLinkGroups = adminPreview ? adminPreviewLinkGroups : adminLinkGroups;
  const topbarLinks = visibleLinkGroups.flatMap((group) => group.links).slice(0, 3);
  const isEditorPath = pathname?.startsWith("/admin/homepage") ?? false;
  const isCatalogPublishingPath = pathname?.startsWith("/admin/product-placement") ?? false;

  if (pathname === "/admin/login") return children;

  // Homepage Studio owns its complete canvas and toolbar. The standard shell would
  // reduce the working area and duplicate controls, so it intentionally stays full-screen.
  if (isEditorPath) {
    return <div className="admin-editor-frame min-h-screen bg-white">{children}</div>;
  }

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
      className={cn("admin-app", isMobileNavOpen && "admin-app--nav-open")}
      data-store-area="Admin"
      data-store-component="AdminShell"
      data-store-section="admin.shell"
    >
      <button aria-label="Close admin navigation" className="admin-nav-scrim" onClick={() => setIsMobileNavOpen(false)} type="button" />

      <aside aria-label="Admin sidebar" className="admin-sidebar" id="admin-navigation-drawer">
        <div className="admin-brand">
          <Link aria-label="Modern State Admin overview" className="flex min-w-0 items-center gap-3" href="/admin" onClick={() => setIsMobileNavOpen(false)}>
            <span aria-hidden="true" className="admin-brand-mark">MS</span>
            <span className="min-w-0">
              <span className="admin-brand-name">Modern State</span>
              <span className="admin-brand-role">Store admin</span>
            </span>
          </Link>
          <button aria-label="Close navigation" className="admin-sidebar-close" onClick={() => setIsMobileNavOpen(false)} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <nav aria-label="Admin navigation" className="admin-nav">
          {visibleLinkGroups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <p className="admin-nav-label">{group.label}</p>
              {group.links.map(({ label, href, icon: Icon }) => {
                const active = isActiveAdminHref(pathname, href);
                const catalogPublishingLink = href === "/admin/product-placement";

                return (
                  <div key={href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className="admin-nav-link"
                      href={href}
                      onClick={() => setIsMobileNavOpen(false)}
                    >
                      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                      <span>{label}</span>
                      {catalogPublishingLink ? (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("admin-nav-chevron", !isCatalogPublishingPath && "admin-nav-chevron--closed")}
                          size={14}
                        />
                      ) : null}
                    </Link>
                    {catalogPublishingLink && isCatalogPublishingPath ? (
                      <div className="admin-subnav">
                        {catalogPublishingLinks.map(([sectionLabel, hash]) => (
                          <a
                            aria-current={isCatalogHashActive(currentHash, hash) ? "page" : undefined}
                            href={hash}
                            key={hash}
                            onClick={() => setIsMobileNavOpen(false)}
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
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-source-note">
            <span aria-hidden="true" className="admin-source-dot" />
            <span><strong className="block text-white/85">Square catalog</strong>Read-only source of truth</span>
          </div>
          {!adminPreview ? (
            <button className="admin-signout" disabled={isSigningOut} onClick={signOut} type="button">
              <LogOut aria-hidden="true" size={15} />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          ) : null}
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            aria-controls="admin-navigation-drawer"
            aria-expanded={isMobileNavOpen}
            aria-label="Open admin navigation"
            className="admin-menu-button"
            onClick={() => setIsMobileNavOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" size={19} />
          </button>
          <div className="admin-topbar-copy">
            <p className="admin-topbar-title">{adminPageTitle(pathname)}</p>
            <p className="admin-topbar-context">Modern State / Admin</p>
          </div>
          <nav aria-label="Admin shortcuts" className="admin-topbar-nav">
            {topbarLinks.map(({ href, label }) => (
              <Link aria-current={isActiveAdminHref(pathname, href) ? "page" : undefined} href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="admin-topbar-actions">
            <Link className="admin-topbar-link" href="/" rel="noreferrer" target="_blank">
              <span className="hidden sm:inline">View store</span>
              <ArrowUpRight aria-hidden="true" size={13} />
            </Link>
          </div>
        </header>
        <div className="admin-scroll">{children}</div>
      </div>
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
  if (!pathname) return false;
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function adminPageTitle(pathname: string | null) {
  if (!pathname || pathname === "/admin") return "Overview";
  if (pathname.startsWith("/admin/products/")) return "Product editor";
  if (pathname.startsWith("/admin/products") || pathname.startsWith("/admin/catalog")) return "Products";
  if (pathname.startsWith("/admin/product-placement")) return "Catalog publishing";
  if (pathname.startsWith("/admin/inventory")) return "Inventory";
  if (pathname.startsWith("/admin/orders")) return "Orders";
  if (pathname.startsWith("/admin/fulfillment")) return "Fulfillment";
  return "Store admin";
}
