/**
 * Reads only published Storefront CMS content. A validated hosted design
 * preview deliberately falls back to the checked-in page templates instead.
 */

import "server-only";

import type { ReadCmsDocumentInput } from "@/server/admin/admin-cms-document-service";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { isStorefrontDesignPreviewEnabled } from "@/server/storefront/design-preview";

type PublishedStorefrontCmsDocumentInput = Omit<ReadCmsDocumentInput, "statuses">;

export async function readPublishedStorefrontCmsDocument(
  input: PublishedStorefrontCmsDocumentInput
) {
  if (isStorefrontDesignPreviewEnabled()) {
    return null;
  }

  return readLatestCmsDocument({ ...input, statuses: ["PUBLISHED"] });
}
