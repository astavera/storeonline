/**
 * Renders the dedicated store administration workspace.
 */

import { StoreSettingsManager, type AdminPolicyRecord, type SettingsArea } from "@/components/admin/store-settings-manager";
import { storePolicyDefinitions } from "@/config/store-administration.config";
import { createStorePolicyDocument } from "@/lib/cms/store-policy-document";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readAdminStoreLocations } from "@/server/admin/store-location-admin-service";
import { readAdminStoreAdministrationSettings } from "@/server/admin/store-administration-settings-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminStoreSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ area?: string }>;
}) {
  const area = readSettingsArea((await searchParams)?.area);
  const [settings, locations, policies] = await Promise.all([
    readAdminStoreAdministrationSettings(),
    readAdminStoreLocations(),
    Promise.all(storePolicyDefinitions.map(readPolicyRecord))
  ]);

  return <StoreSettingsManager initialArea={area} initialLocations={locations} initialPolicies={policies} initialSettings={settings} key={area} />;
}

function readSettingsArea(value?: string): SettingsArea {
  return value === "locations" || value === "tax" || value === "policies" ? value : "business";
}

async function readPolicyRecord(definition: (typeof storePolicyDefinitions)[number]): Promise<AdminPolicyRecord> {
  try {
    const document = await readLatestCmsDocument({
      entityType: "policy",
      entityId: definition.id,
      statuses: ["DRAFT", "PUBLISHED"]
    });
    return { definition, document: document ?? createStorePolicyDocument(definition) };
  } catch {
    return { definition, document: createStorePolicyDocument(definition) };
  }
}
