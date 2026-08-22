/**
 * Provides audited CRUD operations for storefront and fulfillment locations.
 */

import "server-only";

import { z } from "zod";
import { storeLocations } from "@/config/locations.config";
import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

export const adminStoreLocationSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Location slug must use lowercase letters, numbers, and hyphens."),
  name: z.string().trim().min(1).max(140),
  address: z.string().trim().min(1).max(240),
  locality: z.string().trim().max(180),
  phone: z.string().trim().max(40),
  hours: z.string().trim().max(600),
  notes: z.string().trim().max(1000),
  squareLocationId: z.string().trim().max(100),
  publicVisible: z.boolean(),
  displayOrder: z.number().int().min(0).max(999),
  pickupEnabled: z.boolean(),
  localDeliveryEnabled: z.boolean(),
  shippingFulfillmentEnabled: z.boolean()
}).superRefine((location, context) => {
  if (!location.pickupEnabled && !location.localDeliveryEnabled && !location.shippingFulfillmentEnabled) {
    context.addIssue({
      code: "custom",
      message: "Enable at least one fulfillment mode for an active location."
    });
  }
});

export type AdminStoreLocation = z.infer<typeof adminStoreLocationSchema> & {
  id: string;
  archivedAt: string | null;
  updatedAt: string | null;
};

export type AdminStoreLocationsSnapshot = {
  locations: AdminStoreLocation[];
  persistenceAvailable: boolean;
  source: "database" | "configuration";
};

export async function readAdminStoreLocations(): Promise<AdminStoreLocationsSnapshot> {
  if (process.env.DATABASE_URL) {
    try {
      const locations = await getPrismaClient().storeLocation.findMany({
        where: { archivedAt: null },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
      });
      return {
        locations: locations.map((location) => ({
          id: location.id,
          slug: location.slug,
          name: location.name,
          address: location.address,
          locality: location.locality,
          phone: location.phone ?? "",
          hours: location.hours,
          notes: location.notes,
          squareLocationId: location.squareLocationId ?? "",
          publicVisible: location.publicVisible,
          displayOrder: location.displayOrder,
          pickupEnabled: location.pickupEnabled,
          localDeliveryEnabled: location.localDeliveryEnabled,
          shippingFulfillmentEnabled: location.shippingFulfillmentEnabled,
          archivedAt: location.archivedAt?.toISOString() ?? null,
          updatedAt: location.updatedAt.toISOString()
        })),
        persistenceAvailable: true,
        source: "database"
      };
    } catch (error) {
      console.warn("[store-locations] Database locations unavailable; using reviewed configuration.", error);
    }
  }

  return {
    locations: storeLocations.map((location, index) => ({
      ...location,
      squareLocationId: "",
      publicVisible: location.slug !== "warehouse",
      displayOrder: index,
      archivedAt: null,
      updatedAt: null
    })),
    persistenceAvailable: false,
    source: "configuration"
  };
}

export async function persistAdminStoreLocation(input: {
  actorId: string;
  location: unknown;
}) {
  const parsed = adminStoreLocationSchema.safeParse(input.location);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.issues.map((issue) => issue.message) };
  }
  if (!process.env.DATABASE_URL) {
    throw new PersistenceUnavailableError("Store locations");
  }

  const prisma = getPrismaClient();
  const existing = parsed.data.id
    ? await prisma.storeLocation.findUnique({ where: { id: parsed.data.id } })
    : null;
  if (parsed.data.id && !existing) {
    return { ok: false as const, errors: ["The selected location no longer exists."] };
  }

  const data = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    address: parsed.data.address,
    locality: parsed.data.locality,
    phone: parsed.data.phone || null,
    hours: parsed.data.hours,
    notes: parsed.data.notes,
    squareLocationId: parsed.data.squareLocationId || null,
    publicVisible: parsed.data.publicVisible,
    displayOrder: parsed.data.displayOrder,
    pickupEnabled: parsed.data.pickupEnabled,
    localDeliveryEnabled: parsed.data.localDeliveryEnabled,
    shippingFulfillmentEnabled: parsed.data.shippingFulfillmentEnabled
  };

  try {
    const saved = existing
      ? await prisma.storeLocation.update({ where: { id: existing.id }, data })
      : await prisma.storeLocation.create({ data });

    await recordAdminAuditEvent({
      actorId: input.actorId,
      action: existing ? "STORE_LOCATION_UPDATED" : "STORE_LOCATION_CREATED",
      entityType: "StoreLocation",
      entityId: saved.id,
      before: existing,
      after: saved
    });

    return {
      ok: true as const,
      location: {
        id: saved.id,
        slug: saved.slug,
        name: saved.name,
        address: saved.address,
        locality: saved.locality,
        phone: saved.phone ?? "",
        hours: saved.hours,
        notes: saved.notes,
        squareLocationId: saved.squareLocationId ?? "",
        publicVisible: saved.publicVisible,
        displayOrder: saved.displayOrder,
        pickupEnabled: saved.pickupEnabled,
        localDeliveryEnabled: saved.localDeliveryEnabled,
        shippingFulfillmentEnabled: saved.shippingFulfillmentEnabled,
        archivedAt: saved.archivedAt?.toISOString() ?? null,
        updatedAt: saved.updatedAt.toISOString()
      },
      errors: []
    };
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Unique constraint")
      ? "That slug or Square location ID is already assigned to another location."
      : "The location could not be saved.";
    return { ok: false as const, errors: [message] };
  }
}
