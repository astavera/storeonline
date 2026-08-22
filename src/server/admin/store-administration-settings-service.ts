/**
 * Reads and versions business and storefront tax-estimate settings.
 */

import "server-only";

import { z } from "zod";
import {
  defaultStoreAdministrationSettings,
  type StoreAdministrationSettings
} from "@/config/store-administration.config";
import { readLocalCmsVersions, writeLocalCmsVersion } from "@/server/admin/admin-local-cms-store";
import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { createDatabaseCmsVersion, readLatestDatabaseCmsVersion } from "@/server/db/cms-version-repository";
import {
  isDevelopmentLocalPersistenceEnabled,
  PersistenceUnavailableError,
  requireDatabaseOrDevelopmentFallback
} from "@/server/db/persistence-policy";

const entityType = "STORE_ADMINISTRATION_SETTINGS";
const entityId = "global";
const localEntityId = "store-administration-settings-global";

const emptyOrEmail = z.string().trim().max(254).refine(
  (value) => value === "" || z.email().safeParse(value).success,
  "Support email must be a valid email address."
);

export const storeAdministrationSettingsSchema = z.object({
  business: z.object({
    storeName: z.string().trim().min(1).max(140),
    legalName: z.string().trim().min(1).max(180),
    supportEmail: emptyOrEmail,
    supportPhone: z.string().trim().max(40),
    storefrontTagline: z.string().trim().max(280)
  }),
  tax: z.object({
    calculationProvider: z.literal("square_catalog"),
    estimateRatePercent: z.number().min(0).max(25),
    showEstimateInCart: z.boolean(),
    effectiveAt: z.string().trim().max(40)
  }),
  updatedAt: z.string().trim().max(40)
});

export type StoreAdministrationSettingsSnapshot = {
  settings: StoreAdministrationSettings;
  status: "DRAFT" | "PUBLISHED" | "DEFAULT";
  version: number | null;
  updatedAt: string | null;
  persistenceAvailable: boolean;
};

export async function readAdminStoreAdministrationSettings(): Promise<StoreAdministrationSettingsSnapshot> {
  return readSettings(["DRAFT", "PUBLISHED"]);
}

export async function readPublishedStoreAdministrationSettings(): Promise<StoreAdministrationSettings> {
  return (await readSettings(["PUBLISHED"])).settings;
}

export async function persistStoreAdministrationSettings(input: {
  actorId: string;
  operation: "save_draft" | "publish";
  settings: unknown;
}) {
  const parsed = storeAdministrationSettingsSchema.safeParse(input.settings);
  if (!parsed.success) {
    return {
      ok: false as const,
      errors: parsed.error.issues.map((issue) => issue.message)
    };
  }

  const settings: StoreAdministrationSettings = {
    ...parsed.data,
    updatedAt: new Date().toISOString()
  };
  const status = input.operation === "publish" ? "PUBLISHED" : "DRAFT";
  const current = await readAdminStoreAdministrationSettings();
  const persistence = requireDatabaseOrDevelopmentFallback("Store administration settings");

  if (persistence === "database") {
    try {
      const created = await createDatabaseCmsVersion({
        entityType,
        entityId,
        status,
        title: "Store administration settings",
        payload: settings,
        publishedAt: status === "PUBLISHED" ? new Date(settings.updatedAt) : null
      });
      await recordAdminAuditEvent({
        actorId: input.actorId,
        action: status === "PUBLISHED" ? "STORE_SETTINGS_PUBLISHED" : "STORE_SETTINGS_DRAFT_SAVED",
        entityType,
        entityId,
        before: current.settings,
        after: settings
      });
      return { ok: true as const, settings, status, version: created.versionNumber, mode: "database" as const, errors: [] };
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) {
        throw error instanceof PersistenceUnavailableError
          ? error
          : new PersistenceUnavailableError("Store administration settings", { cause: error });
      }
      console.warn("[development-local-persistence] Store settings database write failed; using the explicit local fallback.");
    }
  }

  const created = await writeLocalCmsVersion({
    entityType: "ADMIN_MODULE",
    entityId: localEntityId,
    status,
    title: "Store administration settings",
    payload: settings
  });
  return { ok: true as const, settings, status, version: created.versionNumber, mode: "local-file" as const, errors: [] };
}

async function readSettings(statuses: Array<"DRAFT" | "PUBLISHED">): Promise<StoreAdministrationSettingsSnapshot> {
  try {
    const persistence = requireDatabaseOrDevelopmentFallback("Store administration settings");
    if (persistence === "database") {
      try {
        const record = await readLatestDatabaseCmsVersion({ entityType, entityId, statuses });
        const parsed = storeAdministrationSettingsSchema.safeParse(record?.payload);
        if (record && parsed.success) {
          return {
            settings: parsed.data,
            status: record.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            version: record.versionNumber,
            updatedAt: record.createdAt.toISOString(),
            persistenceAvailable: true
          };
        }
        if (!record) return defaultSnapshot(true);
      } catch (error) {
        if (!isDevelopmentLocalPersistenceEnabled()) throw error;
        console.warn("[development-local-persistence] Store settings database read failed; reading the explicit local fallback.");
      }
    }

    const versions = await readLocalCmsVersions(localEntityId);
    const latest = versions
      .filter((version) => statuses.includes(version.status as "DRAFT" | "PUBLISHED"))
      .sort((left, right) => right.versionNumber - left.versionNumber)[0];
    const parsed = storeAdministrationSettingsSchema.safeParse(latest?.payload);
    if (latest && parsed.success) {
      return {
        settings: parsed.data,
        status: latest.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
        version: latest.versionNumber,
        updatedAt: latest.createdAt,
        persistenceAvailable: true
      };
    }
    return defaultSnapshot(true);
  } catch {
    return defaultSnapshot(false);
  }
}

function defaultSnapshot(persistenceAvailable: boolean): StoreAdministrationSettingsSnapshot {
  return {
    settings: structuredClone(defaultStoreAdministrationSettings),
    status: "DEFAULT",
    version: null,
    updatedAt: null,
    persistenceAvailable
  };
}
