"use client";

import { Home, Layers3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { storefrontEditablePagesByGroup, type StorefrontEditablePageGroup } from "@/config/storefront-pages.config";
import type { CmsScope } from "@/lib/cms";
import { cn } from "@/lib/utils";

const groupOrder: StorefrontEditablePageGroup[] = ["Commerce", "Departments", "Holidays", "Balloons", "Content", "Locations", "Policies", "Products"];

const groupLabels: Record<StorefrontEditablePageGroup, string> = {
  Commerce: "Shop",
  Departments: "Categories",
  Balloons: "Balloons",
  Holidays: "Holidays",
  Content: "Content",
  Policies: "Policies",
  Locations: "Locations",
  Products: "Products"
};

export function StorefrontPageSwitcher({
  className,
  currentEntityId,
  currentScope,
  onBeforeNavigate
}: {
  className?: string;
  currentEntityId?: string;
  currentScope?: CmsScope;
  onBeforeNavigate?: (href: string) => boolean;
}) {
  const router = useRouter();
  const groups = useMemo(() => storefrontEditablePagesByGroup(), []);
  const isHome = currentScope === "homepage" || !currentScope;
  const activeGroup = useMemo(
    () => groupOrder.find((group) => groups[group].some((page) => currentScope === page.scope && currentEntityId === page.entityId)),
    [currentEntityId, currentScope, groups]
  );
  const [openGroups, setOpenGroups] = useState<StorefrontEditablePageGroup[]>(() => defaultOpenGroups(activeGroup));

  useEffect(() => {
    if (!activeGroup) {
      return;
    }

    setOpenGroups((current) => (current.includes(activeGroup) ? current : [...current, activeGroup]));
  }, [activeGroup]);

  function navigate(href: string) {
    if (onBeforeNavigate && !onBeforeNavigate(href)) {
      return;
    }

    router.push(href);
  }

  function toggleGroup(group: StorefrontEditablePageGroup, open: boolean) {
    setOpenGroups((current) => {
      if (open) {
        return current.includes(group) ? current : [...current, group];
      }

      return current.filter((currentGroup) => currentGroup !== group);
    });
  }

  return (
    <section className={cn("rounded-md border border-border bg-surface p-3", className)}>
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Quick edit</p>
        <h2 className="font-display text-lg font-semibold">Store areas</h2>
      </div>

      <button
        aria-pressed={isHome}
        className={cn("mb-3 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold transition", isHome ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary hover:border-primary hover:text-primary")}
        onClick={() => navigate("/admin/homepage")}
        type="button"
      >
        <Home aria-hidden="true" size={16} />
        Homepage
      </button>

      <div className="grid gap-2">
        {groupOrder.map((group) => {
          const pages = groups[group];
          const isGroupOpen = openGroups.includes(group);

          if (!pages.length) {
            return null;
          }

          return (
            <details className="rounded-md border border-border bg-surface-muted" key={group} onToggle={(event) => toggleGroup(group, event.currentTarget.open)} open={isGroupOpen}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold">
                <Layers3 aria-hidden="true" size={15} />
                {groupLabels[group]}
                <span className="ml-auto rounded bg-surface px-1.5 py-0.5 text-[10px] text-secondary">{pages.length}</span>
              </summary>
              <div className="grid gap-1 border-t border-border p-2">
                {pages.map((page) => {
                  const isActive = currentScope === page.scope && currentEntityId === page.entityId;
                  const href = `/admin/homepage?scope=${encodeURIComponent(page.scope)}&id=${encodeURIComponent(page.entityId)}`;

                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn("rounded-md px-2 py-2 text-left text-xs font-semibold transition", isActive ? "bg-primary text-white" : "text-secondary hover:bg-surface hover:text-primary")}
                      key={`${page.scope}-${page.entityId}`}
                      onClick={() => navigate(href)}
                      title={page.description}
                      type="button"
                    >
                      <span className="block truncate">{page.title}</span>
                      <span className={cn("mt-0.5 block truncate text-[10px] font-normal", isActive ? "text-white/75" : "text-secondary")}>{page.route}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function defaultOpenGroups(activeGroup?: StorefrontEditablePageGroup) {
  return Array.from(new Set<StorefrontEditablePageGroup>(["Commerce", "Departments", ...(activeGroup ? [activeGroup] : [])]));
}
