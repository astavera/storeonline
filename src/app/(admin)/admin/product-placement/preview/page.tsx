/**
 * Renders a private preview of the latest Catalog Publishing draft.
 */

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ProductGrid } from "@/components/commerce/product-grid";
import {
  websitePlacementReadinessIssues,
  websiteSurfaceOptions
} from "@/features/catalog/services/website-merchandising-service";
import { readAdminWebsiteMerchandisingWorkspace } from "@/server/admin/website-merchandising-store";
import { isDevelopmentLocalPersistenceEnabled } from "@/server/db/persistence-policy";
import { readPostgresAdminProductsByVariationIds } from "@/server/square/postgres-admin-catalog-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const previewProductLimit = 120;

export default async function CatalogDraftPreviewPage() {
  const workspace = await readAdminWebsiteMerchandisingWorkspace();
  const config = workspace.config;
  const readyPlacements = config.placements
    .filter((placement) => placement.visible && websitePlacementReadinessIssues(placement, config.categories, config.holidays).length === 0)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.squareVariationId.localeCompare(right.squareVariationId));
  const previewPlacements = readyPlacements.slice(0, previewProductLimit);
  const products = await readDraftProducts(previewPlacements.map((placement) => placement.squareVariationId));
  const placementById = new Map(previewPlacements.map((placement) => [placement.squareVariationId, placement]));
  const previewProducts = products.map((product) => {
    const placement = placementById.get(product.squareVariationId);
    return {
      ...product,
      fulfillmentModes: placement?.fulfillmentModes ?? product.fulfillmentModes,
      previewOnly: true as const
    };
  });
  const visibleCategories = config.categories.filter((category) => category.visible);
  const visibleBrands = config.brands.filter((brand) => brand.visible);

  return (
    <main className="p-4 md:p-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-md border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-secondary hover:text-primary" href="/admin/product-placement">
                <ArrowLeft size={16} />Back to Catalog Publishing
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold">Private catalog preview</h1>
                <span className="rounded-pill bg-yellow/20 px-3 py-1 text-xs font-black uppercase text-primary">{workspace.status.toLowerCase()}{workspace.versionNumber ? ` v${workspace.versionNumber}` : ""}</span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-secondary">Only signed-in administrators can see this page. It uses the latest saved draft; the customer storefront still uses published version {workspace.publishedVersionNumber ?? "none"}.</p>
            </div>
            <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold hover:bg-surface-muted" href="/shop" target="_blank">
              View live shop<ExternalLink size={16} />
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PreviewMetric label="Products marked live" value={readyPlacements.length} />
            <PreviewMetric label="Visible categories" value={visibleCategories.length} />
            <PreviewMetric label="Visible brands" value={visibleBrands.length} />
            <PreviewMetric label="Configured spaces" value={websiteSurfaceOptions.filter((surface) => readyPlacements.some((placement) => placement.surfaceIds.includes(surface.id))).length} />
          </div>
        </header>

        <section className="mt-5 rounded-md border border-border bg-surface p-5 sm:p-6" aria-labelledby="draft-spaces-title">
          <h2 className="font-display text-xl font-semibold" id="draft-spaces-title">Where products will appear</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {websiteSurfaceOptions.map((surface) => {
              const count = readyPlacements.filter((placement) => placement.surfaceIds.includes(surface.id)).length;
              return <div className="rounded-md border border-border bg-surface-muted p-4" key={surface.id}><p className="text-sm font-semibold text-primary">{surface.label}</p><p className="mt-1 text-2xl font-black text-primary">{count.toLocaleString()}</p></div>;
            })}
          </div>
        </section>

        <section className="mt-5 rounded-md border border-border bg-surface p-5 sm:p-6" aria-labelledby="draft-products-title">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-blue">Customer view</p>
              <h2 className="mt-1 font-display text-2xl font-semibold" id="draft-products-title">Products in this draft</h2>
            </div>
            {readyPlacements.length > previewProductLimit ? <p className="text-sm font-semibold text-secondary">Showing the first {previewProductLimit} of {readyPlacements.length.toLocaleString()}</p> : null}
          </div>
          {previewProducts.length > 0 ? <div className="mt-6"><ProductGrid cardVariant="compact" products={previewProducts} /></div> : <p className="mt-6 rounded-md border border-dashed border-border bg-surface-muted p-6 text-sm font-semibold text-secondary">No publication-ready products are selected in this draft yet.</p>}
        </section>
      </div>
    </main>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border bg-surface-muted p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary">{label}</p><p className="mt-2 text-2xl font-black text-primary">{value.toLocaleString()}</p></div>;
}

async function readDraftProducts(variationIds: string[]) {
  if (variationIds.length === 0) return [];

  try {
    return await readPostgresAdminProductsByVariationIds(variationIds);
  } catch (error) {
    if (!isDevelopmentLocalPersistenceEnabled()) throw error;
    const preview = await readSquareCatalogPreview();
    const requested = new Set(variationIds);
    return preview?.products.filter((product) => requested.has(product.squareVariationId)) ?? [];
  }
}
