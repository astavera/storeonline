/**
 * Resolves storefront-safe location presentation with a checked-in fallback.
 */

import "server-only";

import { storeLocations, type StoreLocationConfig } from "@/config/locations.config";
import { getPrismaClient } from "@/server/db/prisma";

export async function readPublicStoreLocations(): Promise<StoreLocationConfig[]> {
  if (process.env.DATABASE_URL) {
    try {
      const locations = await getPrismaClient().storeLocation.findMany({
        where: { publicVisible: true, archivedAt: null },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          address: true,
          locality: true,
          phone: true,
          hours: true,
          notes: true,
          pickupEnabled: true,
          localDeliveryEnabled: true,
          shippingFulfillmentEnabled: true
        }
      });
      if (locations.length > 0) {
        return locations.map((location) => ({
          ...location,
          phone: location.phone ?? ""
        }));
      }
    } catch (error) {
      console.warn("[storefront-locations] Published locations unavailable; using reviewed configuration.", error);
    }
  }

  return storeLocations.filter((location) => location.slug !== "warehouse");
}
