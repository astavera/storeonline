/**
 * Renders the return policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import Link from "next/link";
import { customerReturnPolicyText } from "@/features/returns/contracts";

export default function ReturnPolicyPage() {
  return (
    <ContentPageTemplate
      area="Policy"
      body={customerReturnPolicyText}
      sectionId="policy.returns"
      title="Return Policy"
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
