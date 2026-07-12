import { ContentPageTemplate } from "@/components/templates/content-page-template";

export const metadata = {
  title: "About",
  description: "Modern State is the evolution of State News, serving the Upper East Side since 1979."
};

export default function AboutPage() {
  return (
    <ContentPageTemplate
      area="About"
      body="State News began in 1972, opened on Third Avenue in 1979, expanded to East 86th Street in 2006, and continues as Modern State with the same neighborhood-store focus."
      sectionId="about.history"
      title="Modern State is the evolution of State News."
    />
  );
}
