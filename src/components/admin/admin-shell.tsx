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
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarHeart,
  ClipboardList,
  Clock3,
  FileClock,
  Image,
  LayoutDashboard,
  MapPinned,
  Navigation as NavigationIcon,
  Package,
  Palette,
  PartyPopper,
  PencilRuler,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  Users,
  Webhook
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const adminLinkGroups = [
  {
    label: "Control",
    links: [
      ["Dashboard", "/admin"],
      ["Audit Log", "/admin/audit-log"]
    ]
  },
  {
    label: "Storefront",
    links: [
      ["Editor", "/admin/homepage"],
      ["Navigation", "/admin/navigation"],
      ["Departments", "/admin/departments"],
      ["Holidays", "/admin/holidays"],
      ["Media", "/admin/media-library"],
      ["Theme", "/admin/theme"]
    ]
  },
  {
    label: "Catalog",
    links: [
      ["Products", "/admin/products"],
      ["Placement", "/admin/product-placement"],
      ["Display", "/admin/product-display"],
      ["SEO", "/admin/product-seo"],
      ["Images", "/admin/product-images"],
      ["Overrides", "/admin/product-overrides"],
      ["Balloons", "/admin/balloons"]
    ]
  },
  {
    label: "Operations",
    links: [
      ["Orders", "/admin/orders"],
      ["Fulfillment", "/admin/fulfillment"],
      ["Delivery Zones", "/admin/delivery-zones"],
      ["Slots", "/admin/slots"],
      ["Shipping", "/admin/shipping"],
      ["Locations", "/admin/locations"]
    ]
  },
  {
    label: "System",
    links: [
      ["Users & Roles", "/admin/users-roles"],
      ["Sync Status", "/admin/sync-status"],
      ["Webhooks", "/admin/webhooks"]
    ]
  }
] as const;

const adminLinkIcons: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  "Audit Log": FileClock,
  Editor: PencilRuler,
  Navigation: NavigationIcon,
  Departments: BarChart3,
  Holidays: CalendarHeart,
  Media: Image,
  Theme: Palette,
  Products: Package,
  Placement: ClipboardList,
  Display: ShoppingBag,
  SEO: Search,
  Images: Image,
  Overrides: SlidersHorizontal,
  Balloons: PartyPopper,
  Orders: ClipboardList,
  Fulfillment: Truck,
  "Delivery Zones": MapPinned,
  Slots: Clock3,
  Shipping: Truck,
  Locations: MapPinned,
  "Users & Roles": Users,
  "Sync Status": ShieldCheck,
  Webhooks: Webhook
};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const flatLinks: Array<readonly [string, string]> = adminLinkGroups.flatMap((group) => group.links.map(([label, href]) => [label, href] as const));
  const isEditorPath = pathname?.startsWith("/admin/homepage") ?? false;

  return (
    <div
      className={cn(
        "min-h-screen bg-surface-muted lg:fixed lg:inset-0 lg:grid lg:h-screen lg:min-h-0 lg:overflow-hidden",
        isEditorPath ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[260px_1fr]"
      )}
      data-store-area="Admin"
      data-store-component="AdminShell"
      data-store-section="admin.shell"
    >
      <aside className={cn("border-b border-border bg-surface p-4 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r", isEditorPath ? "lg:p-3" : "lg:p-5")}>
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
          {flatLinks.map(([label, href]) => (
            <Link className="shrink-0 rounded-md border border-border px-3 py-2 text-secondary hover:bg-surface-muted hover:text-primary" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
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
                    {group.links.map(([label, href]) => (
                      <Link
                        className={cn(
                          "rounded-md px-3 py-2 text-secondary hover:bg-surface-muted hover:text-primary",
                          isActiveAdminHref(pathname, href) && "bg-surface-muted text-primary"
                        )}
                        href={href}
                        key={href}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
        </nav>
      </aside>
      <div className="lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden">{children}</div>
    </div>
  );
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
