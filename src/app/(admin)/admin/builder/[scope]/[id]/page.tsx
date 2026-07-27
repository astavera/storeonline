import { notFound, redirect } from "next/navigation";
import { BuilderShell } from "@/components/admin/builder/BuilderShell";
import { createCmsPageDocumentForScope, normalizeCmsScope } from "@/lib/cms";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";

export default async function AdminGenericBuilderPage({ params }: { params: Promise<{ scope: string; id: string }> }) {
  const { id, scope: rawScope } = await params;
  const scope = normalizeCmsScope(rawScope);

  if (!scope) {
    notFound();
  }

  if (scope === "homepage") {
    redirect("/admin/homepage");
  }

  const fallbackDocument = createCmsPageDocumentForScope(scope, id);
  const document =
    (await readLatestCmsDocument({
      entityType: fallbackDocument.entityType,
      entityId: fallbackDocument.entityId,
      statuses: ["DRAFT", "PREVIEW", "PUBLISHED"]
    })) ?? fallbackDocument;

  return <BuilderShell initialDocument={document} scope={scope} />;
}
