"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { storefrontEditablePages, type StorefrontEditablePage } from "@/config/storefront-pages.config";
import type { CmsScope } from "@/lib/cms";
import { cn } from "@/lib/utils";

export function StorefrontPageSwitcher({
  additionalPages = [],
  className,
  currentEntityId,
  currentScope,
  onBeforeNavigate
}: {
  additionalPages?: StorefrontEditablePage[];
  className?: string;
  currentEntityId?: string;
  currentScope?: CmsScope;
  onBeforeNavigate?: (href: string) => boolean;
}) {
  const router = useRouter();
  const pages = useMemo(() => {
    const uniquePages = new Map<string, StorefrontEditablePage>();

    [...storefrontEditablePages, ...additionalPages].forEach((page) => {
      uniquePages.set(`${page.scope}:${page.entityId}`, page);
    });

    return Array.from(uniquePages.values());
  }, [additionalPages]);
  const currentValue = currentScope === "homepage" || !currentScope ? "homepage:home" : `${currentScope}:${currentEntityId}`;

  function navigate(value: string) {
    const href =
      value === "homepage:home"
        ? "/admin/homepage"
        : (() => {
            const [scope, ...entityIdParts] = value.split(":");
            return `/admin/homepage?scope=${encodeURIComponent(scope)}&id=${encodeURIComponent(entityIdParts.join(":"))}`;
          })();

    if (onBeforeNavigate && !onBeforeNavigate(href)) {
      return;
    }

    router.push(href);
  }

  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Page</span>
      <select
        aria-label="Page"
        className="h-12 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold outline-none transition focus:border-primary"
        onChange={(event) => navigate(event.currentTarget.value)}
        value={currentValue}
      >
        <option value="homepage:home">Home</option>
        {pages.map((page) => (
          <option key={`${page.scope}:${page.entityId}`} value={`${page.scope}:${page.entityId}`}>
            {page.title}
          </option>
        ))}
      </select>
    </label>
  );
}
