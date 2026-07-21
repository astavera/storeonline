import { BuilderShell } from "@/components/admin/builder/BuilderShell";
import { HomepageStudioEditor } from "@/components/admin/homepage-studio-editor";
import { storefrontEditablePages, websiteHolidayEditorPages } from "@/config/storefront-pages.config";
import { getHomepageEditorState } from "@/features/admin/services/homepage-visual-editor-service";
import { resolveHomepageStorefrontContent } from "@/features/catalog/services/homepage-storefront-content-service";
import { createStorefrontEditorFallbackDocument, normalizeCmsScope, shouldUseStorefrontEditorFallbackDocument } from "@/lib/cms";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHomepagePage({ searchParams }: { searchParams?: Promise<{ scope?: string; id?: string }> }) {
  const params = await searchParams;
  const scope = params?.scope ? normalizeCmsScope(params.scope) : null;
  const id = params?.id;
  const merchandisingPromise = readWebsiteMerchandisingSnapshot();

  if (scope && id) {
    const staticPage = storefrontEditablePages.find((page) => page.scope === scope && page.entityId === id);
    const staticFallback = staticPage ? createStorefrontEditorFallbackDocument({ editablePage: staticPage, entityId: id, scope }) : null;
    const [merchandising, staticStoredDocument] = await Promise.all([
      merchandisingPromise,
      staticFallback
        ? readLatestCmsDocument({ entityType: staticFallback.entityType, entityId: staticFallback.entityId, statuses: ["DRAFT", "PREVIEW", "PUBLISHED"] })
        : Promise.resolve(null)
    ]);
    const additionalPages = websiteHolidayEditorPages(merchandising.holidays);
    const editablePage = staticPage ?? additionalPages.find((page) => page.scope === scope && page.entityId === id);
    const fallbackDocument = createStorefrontEditorFallbackDocument({ editablePage, entityId: id, scope });
    const storedDocument = staticFallback
      ? staticStoredDocument
      : await readLatestCmsDocument({ entityType: fallbackDocument.entityType, entityId: fallbackDocument.entityId, statuses: ["DRAFT", "PREVIEW", "PUBLISHED"] });
    const document = shouldUseStorefrontEditorFallbackDocument({ document: storedDocument, editablePage }) ? fallbackDocument : storedDocument ?? fallbackDocument;

    return <BuilderShell additionalPages={additionalPages} initialDocument={document} key={`${scope}:${document.entityId}`} publicPreviewRoute={editablePage?.route} scope={scope} />;
  }

  const [merchandising, homepageState, storefrontContent] = await Promise.all([merchandisingPromise, getHomepageEditorState(), resolveHomepageStorefrontContent()]);
  const additionalPages = websiteHolidayEditorPages(merchandising.holidays);
  const itemLinkOptions = Array.from(
    new Map(
      [
        ...storefrontContent.itemLinkOptions,
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
  const linkedProductSlugs = new Set(homepageState.sections.flatMap((section) => section.items ?? []).map((item) => item.productSlug).filter((slug): slug is string => Boolean(slug)));
  const previewProducts = storefrontContent.products.filter((product, index) => index < 4 || linkedProductSlugs.has(product.slug));

  return (
    <HomepageStudioEditor
      additionalPages={additionalPages}
      initialHeaderNavigation={homepageState.headerNavigation}
      initialPhotoPresets={homepageState.photoPresets}
      initialSections={homepageState.sections}
      initialSeo={homepageState.seo}
      initialVersions={homepageState.versions}
      itemLinkOptions={itemLinkOptions}
      previewProducts={previewProducts}
    />
  );
}
