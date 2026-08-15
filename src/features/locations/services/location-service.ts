/**
 * Implements the location service workflow for the locations feature.
 */

import { getLocationBySlug, storeLocations } from "@/config/locations.config";

export function listPickupLocations() {
  return storeLocations.filter((location) => location.pickupEnabled);
}

export function requireLocation(slug: string) {
  const location = getLocationBySlug(slug);

  if (!location) {
    throw new Error(`Location not found: ${slug}`);
  }

  return location;
}
