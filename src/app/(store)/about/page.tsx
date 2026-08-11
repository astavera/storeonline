/**
 * Renders the about page and prepares its route-level data.
 */

import { AboutBusinessStory } from "@/features/about/components/about-business-story";

export const metadata = {
  title: "About Us",
  description: "Modern State is the evolution of State News, serving the Upper East Side since 1979."
};

export default function AboutPage() {
  return <AboutBusinessStory />;
}
