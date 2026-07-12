"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cmsSectionCategories, sectionsForScope, type CmsKnownSectionType, type CmsScope } from "@/lib/cms";

export function BuilderSectionLibrary({ onAddSection, scope }: { onAddSection: (type: CmsKnownSectionType) => void; scope: CmsScope }) {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sectionsForScope(scope).filter((section) => {
      if (!normalizedQuery) {
        return true;
      }

      return `${section.label} ${section.description} ${section.category} ${section.type}`.toLowerCase().includes(normalizedQuery);
    });
  }, [query, scope]);

  return (
    <section className="rounded-md border border-border bg-surface p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Add</p>
        <h2 className="font-display text-lg font-semibold">Section library</h2>
      </div>
      <label className="mb-3 flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
        <Search aria-hidden="true" className="text-secondary" size={15} />
        <input className="min-w-0 flex-1 bg-transparent outline-none" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search sections" type="search" value={query} />
      </label>
      <div className="grid max-h-[520px] gap-4 overflow-auto pr-1">
        {cmsSectionCategories.map((category) => {
          const categorySections = sections.filter((section) => section.category === category);

          if (categorySections.length === 0) {
            return null;
          }

          return (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{category}</p>
              <div className="grid gap-2">
                {categorySections.map((section) => (
                  <button className="rounded-md border border-border bg-surface p-3 text-left transition hover:border-primary hover:shadow-soft" key={section.type} onClick={() => onAddSection(section.type)} type="button">
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-semibold">{section.label}</span>
                        <span className="mt-1 line-clamp-2 block text-xs text-secondary">{section.description}</span>
                      </span>
                      <Plus aria-hidden="true" className="mt-0.5 text-secondary" size={16} />
                    </span>
                    <span className="mt-2 block text-[11px] text-secondary">{section.variants.length} variants</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {sections.length === 0 ? (
        <div className="rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary">
          No compatible sections found for this page scope.
          <Button className="mt-3 h-8 px-3 text-xs" onClick={() => setQuery("")} type="button" variant="secondary">
            Clear search
          </Button>
        </div>
      ) : null}
    </section>
  );
}
