/**
 * Renders the return policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import Link from "next/link";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function ReturnPolicyPage() {
  const policy = getStorePolicyDefinition("returns")!;
  return (
    <ContentPageTemplate
      area="Policy"
      body={policy.defaultBody}
      sectionId="policy.returns"
      title={policy.defaultTitle}
    >
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 font-semibold text-white"
        href="/returns"
      >
        Start or track an online return
      </Link>
    </ContentPageTemplate>
  );
}
