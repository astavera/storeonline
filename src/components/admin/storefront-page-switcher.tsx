/**
 * Renders the storefront page switcher interface and its user interactions.
 */

"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSingleSelect } from "@/components/admin/searchable-select";
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
  const [isPending, startTransition] = useTransition();
  const pages = useMemo(() => {
    const uniquePages = new Map<string, StorefrontEditablePage>();

    [...storefrontEditablePages, ...additionalPages].forEach((page) => {
      uniquePages.set(`${page.scope}:${page.entityId}`, page);
    });

    return Array.from(uniquePages.values());
  }, [additionalPages]);
  const currentValue = currentScope === "homepage" || !currentScope ? "" : `${currentScope}:${currentEntityId}`;

  function navigate(value: string) {
    const href =
      value === ""
        ? "/admin/homepage"
        : (() => {
            const [scope, ...entityIdParts] = value.split(":");
            return `/admin/homepage?scope=${encodeURIComponent(scope)}&id=${encodeURIComponent(entityIdParts.join(":"))}`;
          })();

    if (onBeforeNavigate && !onBeforeNavigate(href)) {
      return;
    }

    startTransition(() => router.push(href));
  }

  return (
    <div className={cn("block", className)}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{isPending ? "Loading page..." : "Page"}</span>
      <SearchableSingleSelect
        allLabel="Home"
        disabled={isPending}
        label="Page"
        onChange={navigate}
        options={pages.map((page) => ({
          id: `${page.scope}:${page.entityId}`,
          label: page.title
        }))}
        searchLabel="Search pages"
        value={currentValue}
      />
    </div>
  );
}
