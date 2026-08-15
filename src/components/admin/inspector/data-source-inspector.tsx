/**
 * Configures CMS data sources and their selected catalog references.
 */

"use client";

import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import { cmsDataSourceTypes, type CmsSection, type CmsDataSourceType } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorSelect } from "./inspector-fields";

export function DataSourceInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  const linkedProductSlugs = Array.isArray(section.dataSource.manualIds) ? section.dataSource.manualIds : [];
  const linkedProductSet = new Set(linkedProductSlugs);

  function updateDataSource(patch: Partial<CmsSection["dataSource"]>) {
    updateSection({
      dataSource: {
        ...section.dataSource,
        ...patch
      }
    });
  }

  function addProduct(slug: string) {
    if (linkedProductSet.has(slug)) {
      return;
    }

    updateDataSource({
      manualIds: [...linkedProductSlugs, slug],
      type: section.dataSource.type === "department" ? "department" : "productPlacement"
    });
  }

  function removeProduct(slug: string) {
    updateDataSource({
      manualIds: linkedProductSlugs.filter((item) => item !== slug)
    });
  }

  function moveProduct(slug: string, direction: -1 | 1) {
    const currentIndex = linkedProductSlugs.indexOf(slug);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= linkedProductSlugs.length) {
      return;
    }

    const nextSlugs = [...linkedProductSlugs];
    const [moved] = nextSlugs.splice(currentIndex, 1);
    nextSlugs.splice(targetIndex, 0, moved);
    updateDataSource({ manualIds: nextSlugs });
  }

  function seedManualProducts() {
    updateDataSource({
      manualIds: storefrontProducts.slice(0, Number(section.dataSource.limit ?? 4)).map((product) => product.slug)
    });
  }

  return (
    <div className="grid gap-3">
      <InspectorField label="Source type">
        <InspectorSelect value={section.dataSource.type} onChange={(event) => updateDataSource({ type: event.currentTarget.value as CmsDataSourceType })}>
          {cmsDataSourceTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Source ID">
        <InspectorInput value={String(section.dataSource.id ?? "")} onChange={(event) => updateDataSource({ id: event.currentTarget.value })} placeholder="homepage-featured" />
      </InspectorField>
      <InspectorField label="Limit">
        <InspectorInput min={1} type="number" value={Number(section.dataSource.limit ?? 8)} onChange={(event) => updateDataSource({ limit: Number(event.currentTarget.value) })} />
      </InspectorField>

      <section className="rounded-md border border-border bg-surface-muted p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Link2 aria-hidden="true" size={15} />
              Linked featured items
            </p>
            <p className="mt-1 text-xs text-secondary">Choose exactly which real products appear in this section. Product price, inventory and checkout stay locked to catalog data.</p>
          </div>
          {linkedProductSlugs.length === 0 ? (
            <button className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold" onClick={seedManualProducts} type="button">
              Use current
            </button>
          ) : null}
        </div>

        <div className="grid gap-2">
          {linkedProductSlugs.map((slug, index) => {
            const product = storefrontProducts.find((candidate) => candidate.slug === slug);

            if (!product) {
              return null;
            }

            return (
              <article className="grid gap-2 rounded-md border border-border bg-surface p-2" key={slug}>
                <div className="flex items-start gap-2">
                  <img alt="" className="h-12 w-12 rounded-md object-cover" src={product.imageUrl || "/images/product-fallback.svg"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-xs text-secondary">{product.department}</p>
                  </div>
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-secondary">{index + 1}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <SmallIconButton label="Move up" onClick={() => moveProduct(slug, -1)}>
                    <ArrowUp aria-hidden="true" size={13} />
                  </SmallIconButton>
                  <SmallIconButton label="Move down" onClick={() => moveProduct(slug, 1)}>
                    <ArrowDown aria-hidden="true" size={13} />
                  </SmallIconButton>
                  <SmallIconButton label="Remove product" onClick={() => removeProduct(slug)}>
                    <Trash2 aria-hidden="true" size={13} />
                  </SmallIconButton>
                </div>
              </article>
            );
          })}

          {linkedProductSlugs.length === 0 ? <p className="rounded-md border border-border bg-surface p-3 text-xs text-secondary">No manual featured items yet. The section is using its automatic product source.</p> : null}
        </div>

        <div className="mt-3 grid gap-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Add product</p>
          {storefrontProducts
            .filter((product) => !linkedProductSet.has(product.slug))
            .map((product) => (
              <button className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2 text-left text-xs transition hover:border-primary hover:text-primary" key={product.slug} onClick={() => addProduct(product.slug)} type="button">
                <Plus aria-hidden="true" className="shrink-0" size={13} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{product.name}</span>
                  <span className="block text-secondary">{product.department}</span>
                </span>
              </button>
            ))}
        </div>
      </section>
      <p className="rounded-md border border-border bg-surface-muted p-3 text-xs text-secondary">CMS controls placement, labels and layout. Square remains the source of truth for prices, inventory, payments and catalog identity.</p>
    </div>
  );
}

function SmallIconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface-muted text-secondary transition hover:border-primary hover:text-primary" onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}
