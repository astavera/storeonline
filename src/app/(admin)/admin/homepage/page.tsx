/**
 * Renders the admin homepage page and prepares its route-level data.
 */

import { BuilderShell } from "@/components/admin/builder";
import { redirect } from "next/navigation";
import { HomepageStudioEditor } from "@/features/homepage/components/admin/homepage-studio-editor";
import { storefrontEditablePages, websiteHolidayEditorPages } from "@/config/storefront-pages.config";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  websiteCategoryPath,
  websitePlacementReadinessIssues,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";
import type { HomepageItemLinkOption } from "@/features/homepage";
import { createHomepageItemLinkOptions } from "@/features/homepage/server";
import { getHomepageEditorState } from "@/features/homepage/server";
import { createStorefrontEditorFallbackDocument, normalizeCmsScope, shouldUseStorefrontEditorFallbackDocument } from "@/lib/cms";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readPostgresAdminCatalogPage } from "@/server/square/postgres-admin-catalog-store";
import { adminCapabilities } from "@/server/admin/admin-security";
import { requireAdminSession } from "@/server/admin/admin-session";
import { isStorefrontAdminPreviewEnabled } from "@/server/storefront/admin-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHomepagePage({ searchParams }: { searchParams?: Promise<{ scope?: string; id?: string; homepage?: string }> }) {
  await requireAdminSession({ capability: adminCapabilities.read, returnTo: "/admin/homepage" });
  const params = await searchParams;
  if (isStorefrontAdminPreviewEnabled() && (params?.scope || params?.id)) {
    redirect("/admin/homepage");
  }
  const scope = params?.scope ? normalizeCmsScope(params.scope) : null;
  const id = params?.id;
  const merchandisingPromise = readWebsiteMerchandisingSnapshot();

  if (scope && id) {
    const staticPage = storefrontEditablePages.find((page) => page.scope === scope && page.entityId === id);
    const staticFallback = staticPage ? createStorefrontEditorFallbackDocument({ editablePage: staticPage, entityId: id, scope }) : null;
    const [merchandising, staticStoredDocument, catalogProducts] = await Promise.all([
      merchandisingPromise,
      staticFallback
        ? readLatestCmsDocument({ entityType: staticFallback.entityType, entityId: staticFallback.entityId, statuses: ["DRAFT", "PREVIEW", "PUBLISHED"] })
        : Promise.resolve(null),
      readHomepageEditorCatalogProducts()
    ]);
    const additionalPages = websiteHolidayEditorPages(merchandising.holidays);
    const editablePage = staticPage ?? additionalPages.find((page) => page.scope === scope && page.entityId === id);
    const fallbackDocument = createStorefrontEditorFallbackDocument({ editablePage, entityId: id, scope });
    const storedDocument = staticFallback
      ? staticStoredDocument
      : await readLatestCmsDocument({ entityType: fallbackDocument.entityType, entityId: fallbackDocument.entityId, statuses: ["DRAFT", "PREVIEW", "PUBLISHED"] });
    const document = shouldUseStorefrontEditorFallbackDocument({ document: storedDocument, editablePage }) ? fallbackDocument : storedDocument ?? fallbackDocument;

    return <BuilderShell additionalPages={additionalPages} catalogProducts={catalogProducts} initialDocument={document} key={`${scope}:${document.entityId}`} publicPreviewRoute={editablePage?.route} scope={scope} />;
  }

  const [merchandising, homepageState, adminCatalogProducts] = await Promise.all([
    merchandisingPromise,
    getHomepageEditorState(params?.homepage),
    readHomepageEditorCatalogProducts()
  ]);
  const additionalPages = websiteHolidayEditorPages(merchandising.holidays);
  const toysCategory = merchandising.categories.find(
    (category) => category.slug === "toys"
  );
  const toyEditorCategories = toysCategory
    ? merchandising.categories
        .filter((category) => category.parentId === toysCategory.id)
        .sort(
          (first, second) =>
            first.sortOrder - second.sortOrder ||
            first.name.localeCompare(second.name)
        )
    : [];
  const previewProducts = enrichHomepageEditorProducts(
    Array.from(
      new Map(
        [
          ...adminCatalogProducts,
          ...(process.env.E2E_CATALOG_FIXTURE === "true" ? storefrontProducts : [])
        ].map((product) => [
          product.squareVariationId,
          product
        ])
      ).values()
    ),
    merchandising
  );
  const merchandisingLinkOptions = createHomepageItemLinkOptions({
    brands: merchandising.brands,
    categories: merchandising.categories,
    products: previewProducts
  }).map((option) => {
    if (option.type === "category") {
      const category = merchandising.categories.find(
        (candidate) => candidate.slug === option.value
      );
      const productCount = category
        ? merchandising.placements.filter(
            (placement) =>
              placement.visible && placement.categoryIds.includes(category.id)
          ).length
        : 0;
      const visibilityLabel =
        category && !category.visible ? " — hidden in Catalog Publishing" : "";
      const imageLabel =
        category && !category.imageUrl.trim() ? " — add image" : "";

      return {
        ...option,
        label: `${option.label} (${productCount} products)${visibilityLabel}${imageLabel}`
      };
    }

    if (option.type === "brand") {
      const brand = merchandising.brands.find(
        (candidate) => candidate.slug === option.value
      );
      const productCount = previewProducts.filter((product) =>
        product.websiteBrandIds?.includes(brand?.id ?? "")
      ).length;
      const visibilityLabel =
        brand && !brand.visible ? " — hidden in Catalog Publishing" : "";

      return {
        ...option,
        label: `${option.label} (${productCount} products)${visibilityLabel}`
      };
    }

    if (option.type === "product") {
      const placement = merchandising.placements.find(
        (candidate) => candidate.squareVariationId === option.squareVariationId
      );
      const needsSetup =
        !placement ||
        !placement.visible ||
        websitePlacementReadinessIssues(
          placement,
          merchandising.categories,
          merchandising.holidays
        ).length > 0;

      return needsSetup
        ? { ...option, label: `${option.label} — needs setup` }
        : option;
    }

    return option;
  });
  const itemLinkOptions: HomepageItemLinkOption[] = Array.from(
    new Map(
      [
        ...merchandisingLinkOptions,
        ...additionalPages.map((page) => ({
          type: "page" as const,
          value: page.route,
          label: page.title,
          href: page.route,
          title: page.title,
          body: page.description
        }))
      ].map((option) => [`${option.type}:${option.value}`, option])
    ).values()
  );
  const itemLinkOptionByDestination = new Map(
    itemLinkOptions.map((option) => [
      `${option.type}:${option.value}`,
      option
    ])
  );
  const editorSections = homepageState.sections.map((section) => ({
    ...section,
    items: section.items?.map((item) => {
      if (!item.linkType || !item.linkValue) {
        return item;
      }

      const option = itemLinkOptionByDestination.get(
        `${item.linkType}:${item.linkValue}`
      );

      return option
        ? {
            ...item,
            body: option.body ?? item.body,
            href: option.href,
            image: option.image ?? item.image,
            imageAlt: option.imageAlt ?? item.imageAlt,
            productSlug: option.productSlug ?? item.productSlug,
            squareVariationId:
              option.squareVariationId ?? item.squareVariationId,
            title: option.title
          }
        : item;
    })
  }));

  return (
    <HomepageStudioEditor
      additionalPages={additionalPages}
      initialHeaderNavigation={homepageState.headerNavigation}
      initialPhotoPresets={homepageState.photoPresets}
      initialSections={editorSections}
      initialSeo={homepageState.seo}
      initialVersions={homepageState.versions}
      initialWorkspace={homepageState.workspace}
      initialWorkspaces={homepageState.workspaces}
      itemLinkOptions={itemLinkOptions}
      key={homepageState.workspace.id}
      previewCategories={toyEditorCategories}
      previewProducts={previewProducts}
    />
  );
}

async function readHomepageEditorCatalogProducts() {
  const adminPreviewEnabled = isStorefrontAdminPreviewEnabled();
  const preferLocalCatalog =
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK === "true" &&
    process.env.PREFER_LOCAL_SQUARE_CATALOG === "true";

  if (!preferLocalCatalog) {
    try {
      const catalogPage = await readPostgresAdminCatalogPage({
        page: 1,
        pageSize: 100
      });

      if (catalogPage.products.length > 0 || adminPreviewEnabled) {
        return catalogPage.products;
      }
    } catch (error) {
      if (adminPreviewEnabled) {
        throw error;
      }
      // Development can use the read-only Square preview when PostgreSQL is unavailable.
    }
  }

  if (adminPreviewEnabled) {
    return [];
  }

  const preview = await readSquareCatalogPreview();
  return preview?.products.slice(0, 100) ?? [];
}

function enrichHomepageEditorProducts(
  products: StorefrontProduct[],
  merchandising: WebsiteMerchandisingConfig
) {
  const placementByVariationId = new Map(
    merchandising.placements.map((placement) => [
      placement.squareVariationId,
      placement
    ])
  );
  const categoryById = new Map(
    merchandising.categories.map((category) => [category.id, category])
  );

  return products.map((product) => {
    const placement = placementByVariationId.get(product.squareVariationId);

    if (!placement) {
      return product;
    }

    const assignedCategories = placement.categoryIds
      .map((categoryId) => categoryById.get(categoryId))
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(category)
      );
    const websiteCategorySlugs = Array.from(
      new Set(
        assignedCategories.flatMap((category) =>
          websiteCategoryPath(category, merchandising.categories).map(
            (pathCategory) => pathCategory.slug
          )
        )
      )
    );
    const primaryCategory = [...assignedCategories].sort(
      (first, second) =>
        websiteCategoryPath(second, merchandising.categories).length -
        websiteCategoryPath(first, merchandising.categories).length
    )[0];

    return {
      ...product,
      ageGroups:
        placement.ageGroups.length > 0
          ? placement.ageGroups
          : product.ageGroups,
      department: primaryCategory?.name ?? product.department,
      fulfillmentModes:
        placement.fulfillmentModes.length > 0
          ? placement.fulfillmentModes
          : product.fulfillmentModes,
      websiteBrandIds: placement.brandIds,
      websiteCategorySlugs,
      websiteSurfaces: placement.surfaceIds
    };
  });
}
