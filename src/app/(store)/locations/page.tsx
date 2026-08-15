/**
 * Renders the locations page and prepares its route-level data.
 */

import { LocationsIndexTemplate } from "@/components/templates/locations-page-template";

export const metadata = {
  title: "Locations",
  description: "Modern State store locations on NYC's Upper East Side."
};

export default function LocationsPage() {
  return <LocationsIndexTemplate />;
}
