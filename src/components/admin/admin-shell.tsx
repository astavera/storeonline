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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BadgePercent,
  BarChart3,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  PanelsTopLeft,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UsersRound,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AdminGlobalSearch } from "@/components/admin/admin-global-search";
import { AdminNotificationBell } from "@/components/admin/admin-notification-bell";
import { cn } from "@/lib/utils";

type AdminNavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
};

type AdminNavGroup = {
  label: string;
  links: AdminNavLink[];
};

const adminLinkGroups: AdminNavGroup[] = [
  {
    label: "Overview",
    links: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard, permission: "dashboard:read" }
    ]
  },
  {
    label: "Commerce",
    links: [
      { label: "Products", href: "/admin/products", icon: PackageSearch, permission: "catalog:read" },
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag, permission: "orders:read" },
      { label: "Customers", href: "/admin/customers", icon: UsersRound, permission: "customers:read" }
    ]
  },
  {
    label: "Storefront",
    links: [
      { label: "Website Editor", href: "/admin/storefront-pages", icon: PanelsTopLeft, permission: "storefront:read" }
    ]
  },
  {
    label: "Marketing",
    links: [
      { label: "Promotions", href: "/admin/promotions", icon: BadgePercent, permission: "promotions:read" },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3, permission: "analytics:read" }
    ]
  },
  {
    label: "Settings",
    links: [
      { label: "Store settings", href: "/admin/settings", icon: Settings2, permission: "store-settings:read" }
    ]
  },
  {
    label: "System",
    links: [
      { label: "System", href: "/admin/users-roles", icon: ShieldCheck, permission: "system:any" }
    ]
  }
];

const adminPreviewLinkGroups: AdminNavGroup[] = [
  {
    label: "Preview tools",
    links: [
      { label: "Website Editor", href: "/admin/homepage", icon: PanelsTopLeft, permission: "storefront:read" },
      { label: "Catalog Browser", href: "/admin/catalog", icon: Boxes, permission: "catalog:read" }
    ]
  }
];

const storeSettingsLinks = [
  { label: "Business details", href: "/admin/settings?area=business", area: "business", permission: "store-settings:read" },
  { label: "Locations", href: "/admin/settings?area=locations", area: "locations", permission: "store-settings:read" },
  { label: "Taxes", href: "/admin/settings?area=tax", area: "tax", permission: "store-settings:read" },
  { label: "Legal & policies", href: "/admin/settings?area=policies", area: "policies", permission: "store-settings:read" },
  { label: "Shipping & delivery", href: "/admin/shipping", area: "shipping", permission: "operations:read" }
] as const;

const systemLinks = [
  { label: "Users & Roles", href: "/admin/users-roles", area: "users", permission: "users:read" },
  { label: "Audit log", href: "/admin/audit-log", area: "audit", permission: "audit:read" },
  { label: "Integration health", href: "/admin/sync-status", area: "integrations", permission: "integrations:read" },
  { label: "Webhook events", href: "/admin/webhooks", area: "webhooks", permission: "integrations:read" },
  { label: "Message templates", href: "/admin/notifications", area: "notifications", permission: "notifications:read" }
] as const;

export function AdminShell({ adminPreview = false, capabilities = [], children }: { adminPreview?: boolean; capabilities?: readonly string[]; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const visibleStoreSettingsLinks = storeSettingsLinks.filter((link) => canUse(capabilities, link.permission));
  const visibleSystemLinks = systemLinks.filter((link) => canUse(capabilities, link.permission));
  const visibleLinkGroups = (adminPreview ? adminPreviewLinkGroups : adminLinkGroups)
    .map((group) => ({ ...group, links: group.links.filter((link) => adminPreview || (link.href === "/admin/settings" ? visibleStoreSettingsLinks.length > 0 : link.permission === "system:any" ? visibleSystemLinks.length > 0 : canUse(capabilities, link.permission))) }))
    .filter((group) => group.links.length > 0);
  const isEditorPath = pathname?.startsWith("/admin/homepage") ?? false;
  const isStoreSettingsPath = isStoreAdministrationPath(pathname);
  const isSystemPath = isSystemAdministrationPath(pathname);
  const requestedSettingsArea = searchParams.get("area");
  const currentSettingsArea = requestedSettingsArea === "locations" || requestedSettingsArea === "tax" || requestedSettingsArea === "policies"
    ? requestedSettingsArea
    : "business";

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
                const storeSettingsLink = href === "/admin/settings";
                const systemLink = href === "/admin/users-roles" && label === "System";
                const destinationHref = systemLink ? visibleSystemLinks[0]?.href ?? href : href;
                const active = storeSettingsLink ? isStoreSettingsPath : systemLink ? isSystemPath : isActiveAdminHref(pathname, href);
                const expandable = storeSettingsLink || systemLink;
                const expanded = storeSettingsLink ? isStoreSettingsPath : systemLink ? isSystemPath : false;

                return (
                  <div key={href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className="admin-nav-link"
                      href={destinationHref}
                      onClick={() => setIsMobileNavOpen(false)}
                    >
                      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                      <span>{label}</span>
                      {expandable ? (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("admin-nav-chevron", !expanded && "admin-nav-chevron--closed")}
                          size={14}
                        />
                      ) : null}
                    </Link>
                    {storeSettingsLink && isStoreSettingsPath ? (
                      <div className="admin-subnav">
                        {visibleStoreSettingsLinks.map(({ area, href: settingsHref, label: settingsLabel }) => (
                          <Link
                            aria-current={isStoreSettingsSubnavActive(pathname, currentSettingsArea, area) ? "page" : undefined}
                            href={settingsHref}
                            key={area}
                            onClick={() => setIsMobileNavOpen(false)}
                          >
                            {settingsLabel}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    {systemLink && isSystemPath ? (
                      <div className="admin-subnav">
                        {visibleSystemLinks.map(({ area, href: systemHref, label: systemLabel }) => (
                          <Link
                            aria-current={isSystemSubnavActive(pathname, area) ? "page" : undefined}
                            href={systemHref}
                            key={area}
                            onClick={() => setIsMobileNavOpen(false)}
                          >
                            {systemLabel}
                          </Link>
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
            <h1 className="admin-topbar-title">{adminPageTitle(pathname)}</h1>
            <p className="admin-topbar-context">Modern State / Admin</p>
          </div>
          <div className="admin-topbar-actions">
            {!adminPreview ? <AdminGlobalSearch className="hidden md:block" /> : null}
            {!adminPreview ? <AdminNotificationBell /> : null}
            {!adminPreview && (canUse(capabilities, "operations:open") || canUse(capabilities, "operations:read")) ? (
              <a aria-label="Open Operations" className="admin-topbar-link" href="https://operation.modernstate.com" rel="noreferrer" target="_blank">
                <Truck aria-hidden="true" size={14} />
                <span className="hidden lg:inline">Open Operations</span>
                <ArrowUpRight aria-hidden="true" size={13} />
              </a>
            ) : null}
            <Link
              aria-label="View store"
              className="admin-topbar-link"
              href="/"
              rel="noreferrer"
              target="_blank"
            >
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

function isActiveAdminHref(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function canUse(capabilities: readonly string[], permission: string) {
  return capabilities.includes("admin:*") || capabilities.includes(permission);
}

function isStoreAdministrationPath(pathname: string | null) {
  return Boolean(pathname && ["/admin/settings", "/admin/shipping"].some((route) => pathname === route || pathname.startsWith(`${route}/`)));
}

function isStoreSettingsSubnavActive(pathname: string | null, currentArea: string, area: string) {
  if (pathname?.startsWith("/admin/shipping")) return area === "shipping";
  return pathname?.startsWith("/admin/settings") ? currentArea === area : false;
}

function isSystemAdministrationPath(pathname: string | null) {
  return Boolean(pathname && ["/admin/users-roles", "/admin/audit-log", "/admin/sync-status", "/admin/webhooks", "/admin/notifications"].some((route) => pathname === route || pathname.startsWith(`${route}/`)));
}

function isSystemSubnavActive(pathname: string | null, area: string) {
  const routeByArea: Record<string, string> = {
    users: "/admin/users-roles",
    audit: "/admin/audit-log",
    integrations: "/admin/sync-status",
    webhooks: "/admin/webhooks",
    notifications: "/admin/notifications"
  };
  const route = routeByArea[area];
  return Boolean(route && pathname && (pathname === route || pathname.startsWith(`${route}/`)));
}

function adminPageTitle(pathname: string | null) {
  if (!pathname || pathname === "/admin") return "Overview";
  if (pathname.startsWith("/admin/products/")) return "Product editor";
  if (pathname.startsWith("/admin/products") || pathname.startsWith("/admin/catalog")) return "Products";
  if (pathname.startsWith("/admin/storefront-pages")) return "Website Editor";
  if (pathname.startsWith("/admin/product-placement")) return "Catalog publishing";
  if (pathname.startsWith("/admin/product-display")) return "Product display";
  if (pathname.startsWith("/admin/product-images")) return "Product images";
  if (pathname.startsWith("/admin/product-overrides")) return "Product overrides";
  if (pathname.startsWith("/admin/product-seo")) return "Product SEO";
  if (pathname.startsWith("/admin/orders")) return "Orders";
  if (pathname.startsWith("/admin/returns")) return "Returns";
  if (pathname.startsWith("/admin/customers")) return "Customers";
  if (pathname.startsWith("/admin/fulfillment")) return "Fulfillment";
  if (pathname.startsWith("/admin/settings")) return "Store settings";
  if (pathname.startsWith("/admin/slots")) return "Pickup and delivery slots";
  if (pathname.startsWith("/admin/shipping")) return "Shipping";
  if (pathname.startsWith("/admin/delivery-zones")) return "Delivery zones";
  if (pathname.startsWith("/admin/locations")) return "Locations";
  if (pathname.startsWith("/admin/navigation")) return "Navigation";
  if (pathname.startsWith("/admin/media")) return "Media";
  if (pathname.startsWith("/admin/promotions")) return "Promotions";
  if (pathname.startsWith("/admin/analytics")) return "Analytics";
  if (pathname.startsWith("/admin/balloons")) return "Balloon builder";
  if (pathname.startsWith("/admin/holidays/new")) return "New holiday";
  if (pathname.startsWith("/admin/holidays/")) return "Holiday detail";
  if (pathname.startsWith("/admin/holidays")) return "Holidays";
  if (pathname.startsWith("/admin/departments/")) return "Department detail";
  if (pathname.startsWith("/admin/theme")) return "Theme";
  if (pathname.startsWith("/admin/sync-status")) return "Sync status";
  if (pathname.startsWith("/admin/notifications")) return "Notifications";
  if (pathname.startsWith("/admin/webhooks")) return "Webhooks";
  if (pathname.startsWith("/admin/audit-log")) return "Audit log";
  if (pathname.startsWith("/admin/users-roles")) return "Users & Roles";
  if (pathname.startsWith("/admin/builder")) return "Page builder";
  return "Store admin";
}
