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
  const merchandising = await readWebsiteMerchandisingSnapshot();
  const additionalPages = websiteHolidayEditorPages(merchandising.holidays);

  if (scope && id) {
    const editablePage = [...storefrontEditablePages, ...additionalPages].find((page) => page.scope === scope && page.entityId === id);
    const fallbackDocument = createStorefrontEditorFallbackDocument({ editablePage, entityId: id, scope });
    const storedDocument = await readLatestCmsDocument({
      entityType: fallbackDocument.entityType,
      entityId: fallbackDocument.entityId,
      statuses: ["DRAFT", "PREVIEW", "PUBLISHED"]
    });
    const document = shouldUseStorefrontEditorFallbackDocument({ document: storedDocument, editablePage }) ? fallbackDocument : storedDocument ?? fallbackDocument;

    return <BuilderShell additionalPages={additionalPages} initialDocument={document} key={`${scope}:${document.entityId}`} publicPreviewRoute={editablePage?.route} scope={scope} />;
  }

  const [homepageState, storefrontContent] = await Promise.all([getHomepageEditorState(), resolveHomepageStorefrontContent()]);
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
      previewFeaturedBrandItems={storefrontContent.featuredBrandItems}
      previewProducts={previewProducts}
    />
  );
}
