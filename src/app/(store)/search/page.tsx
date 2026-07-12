import { ContentPageTemplate } from "@/components/templates/content-page-template";

export default function SearchPage() {
  return <ContentPageTemplate area="Search" body="Search will query the local Square catalog cache and website overrides, not live Square from the browser." sectionId="search.index" title="Search" />;
}
