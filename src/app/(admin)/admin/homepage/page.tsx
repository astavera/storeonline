import { BuilderShell } from "@/components/admin/builder/BuilderShell";
import { HomepageStudioEditor } from "@/components/admin/homepage-studio-editor";
import { storefrontEditablePages } from "@/config/storefront-pages.config";
import { getHomepageEditorState } from "@/features/admin/services/homepage-visual-editor-service";
import { createStorefrontEditorFallbackDocument, normalizeCmsScope, shouldUseStorefrontEditorFallbackDocument } from "@/lib/cms";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHomepagePage({ searchParams }: { searchParams?: Promise<{ scope?: string; id?: string }> }) {
  const params = await searchParams;
  const scope = params?.scope ? normalizeCmsScope(params.scope) : null;
  const id = params?.id;

  if (scope && id) {
    const editablePage = storefrontEditablePages.find((page) => page.scope === scope && page.entityId === id);
    const fallbackDocument = createStorefrontEditorFallbackDocument({ editablePage, entityId: id, scope });
    const storedDocument = await readLatestCmsDocument({
      entityType: fallbackDocument.entityType,
      entityId: fallbackDocument.entityId,
      statuses: ["DRAFT", "PREVIEW", "PUBLISHED"]
    });
    const document = shouldUseStorefrontEditorFallbackDocument({ document: storedDocument, editablePage }) ? fallbackDocument : storedDocument ?? fallbackDocument;

    return <BuilderShell initialDocument={document} key={`${scope}:${document.entityId}`} publicPreviewRoute={editablePage?.route} scope={scope} />;
  }

  const homepageState = await getHomepageEditorState();

  return <HomepageStudioEditor initialHeaderNavigation={homepageState.headerNavigation} initialPhotoPresets={homepageState.photoPresets} initialSections={homepageState.sections} initialSeo={homepageState.seo} initialVersions={homepageState.versions} />;
}
