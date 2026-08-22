/**
 * Renders the focused store administration workspace.
 */

"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Plus,
  Rocket,
  Save,
  ShieldCheck
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  StoreAdministrationSettings,
  StorePolicyDefinition
} from "@/config/store-administration.config";
import type { CmsPageDocument } from "@/lib/cms";
import {
  readStorePolicyFields,
  updateStorePolicyDocument,
  type StorePolicyFields
} from "@/lib/cms/store-policy-document";
import type {
  AdminStoreLocation,
  AdminStoreLocationsSnapshot
} from "@/server/admin/store-location-admin-service";
import type { StoreAdministrationSettingsSnapshot } from "@/server/admin/store-administration-settings-service";
import { cn } from "@/lib/utils";

export type SettingsArea = "business" | "locations" | "tax" | "policies";

export type AdminPolicyRecord = {
  definition: StorePolicyDefinition;
  document: CmsPageDocument;
};

type Notice = {
  tone: "idle" | "success" | "error";
  message: string;
};

export function StoreSettingsManager({
  initialLocations,
  initialPolicies,
  initialSettings,
  initialArea = "business"
}: {
  initialLocations: AdminStoreLocationsSnapshot;
  initialPolicies: AdminPolicyRecord[];
  initialSettings: StoreAdministrationSettingsSnapshot;
  initialArea?: SettingsArea;
}) {
  const activeArea = initialArea;
  const [settings, setSettings] = useState(initialSettings.settings);
  const [locations, setLocations] = useState(initialLocations.locations);
  const [workingLocation, setWorkingLocation] = useState<EditableLocation>(() => locationForEditing(initialLocations.locations[0]));
  const [policies, setPolicies] = useState(initialPolicies);
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialPolicies[0]?.definition.id ?? "terms");
  const [policyFields, setPolicyFields] = useState<Record<string, StorePolicyFields>>(() => Object.fromEntries(
    initialPolicies.map((record) => [record.definition.id, readStorePolicyFields(record.document, record.definition)])
  ));
  const [previewPolicy, setPreviewPolicy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ tone: "idle", message: "Changes stay private until they are published." });
  const [isSaving, setIsSaving] = useState(false);

  const selectedPolicy = useMemo(
    () => policies.find((record) => record.definition.id === selectedPolicyId) ?? policies[0],
    [policies, selectedPolicyId]
  );
  const currentPolicyFields = selectedPolicy ? policyFields[selectedPolicy.definition.id] : undefined;

  async function saveSettings(operation: "save_draft" | "publish") {
    setIsSaving(true);
    setNotice({ tone: "idle", message: operation === "publish" ? "Publishing store settings..." : "Saving a private draft..." });
    try {
      const result = await postStoreSettings({ domain: "settings", operation, settings });
      if (!result.ok) throw new Error(readErrors(result));
      setSettings(result.settings);
      setNotice({
        tone: "success",
        message: operation === "publish" ? "Store settings published." : "Store settings draft saved."
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Store settings could not be saved." });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveLocation() {
    setIsSaving(true);
    setNotice({ tone: "idle", message: "Validating location and fulfillment settings..." });
    try {
      const payload = { ...workingLocation, id: workingLocation.id || undefined };
      const result = await postStoreSettings({ domain: "location", location: payload });
      if (!result.ok) throw new Error(readErrors(result));
      const saved = result.location as AdminStoreLocation;
      setLocations((current) => {
        const exists = current.some((location) => location.id === saved.id);
        return (exists ? current.map((location) => location.id === saved.id ? saved : location) : [...current, saved])
          .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
      });
      setWorkingLocation(saved);
      setNotice({ tone: "success", message: `${saved.name} saved and connected to storefront location data.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The location could not be saved." });
    } finally {
      setIsSaving(false);
    }
  }

  async function savePolicy(operation: "save_draft" | "publish") {
    if (!selectedPolicy || !currentPolicyFields) return;
    setIsSaving(true);
    setNotice({ tone: "idle", message: operation === "publish" ? "Publishing policy..." : "Saving policy draft..." });
    try {
      const document = updateStorePolicyDocument({
        definition: selectedPolicy.definition,
        document: selectedPolicy.document,
        fields: currentPolicyFields
      });
      const result = await postStoreSettings({ domain: "policy", operation, document });
      if (!result.ok) throw new Error(readErrors(result));
      const nextDocument: CmsPageDocument = {
        ...document,
        status: result.status,
        version: result.storage?.versionNumber ?? document.version,
        publishedAt: operation === "publish" ? new Date().toISOString() : document.publishedAt,
        updatedAt: new Date().toISOString()
      };
      setPolicies((current) => current.map((policy) => policy.definition.id === selectedPolicy.definition.id
        ? { ...policy, document: nextDocument }
        : policy));
      setNotice({
        tone: "success",
        message: operation === "publish"
          ? `${currentPolicyFields.title} is live on the storefront.`
          : `${currentPolicyFields.title} draft saved.`
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The policy could not be saved." });
    } finally {
      setIsSaving(false);
    }
  }

  function selectLocation(location: AdminStoreLocation) {
    setWorkingLocation(locationForEditing(location));
  }

  function startNewLocation() {
    setWorkingLocation(blankLocation(locations.length));
  }

  return (
    <main className="admin-page admin-store-settings" data-store-component="StoreSettingsManager">
      <NoticeBanner notice={notice} />

      {activeArea === "business" ? (
        <SettingsPanel
          actions={<SavePublishActions disabled={isSaving || !initialSettings.persistenceAvailable} onPublish={() => saveSettings("publish")} onSave={() => saveSettings("save_draft")} />}
          description="These details are used by shared storefront surfaces. They do not change Square account ownership."
          title="Business details"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Storefront name">
              <TextInput value={settings.business.storeName} onChange={(storeName) => setSettings(updateBusiness(settings, { storeName }))} />
            </Field>
            <Field label="Legal business name">
              <TextInput value={settings.business.legalName} onChange={(legalName) => setSettings(updateBusiness(settings, { legalName }))} />
            </Field>
            <Field label="Support email">
              <TextInput type="email" value={settings.business.supportEmail} onChange={(supportEmail) => setSettings(updateBusiness(settings, { supportEmail }))} />
            </Field>
            <Field label="Support phone">
              <TextInput value={settings.business.supportPhone} onChange={(supportPhone) => setSettings(updateBusiness(settings, { supportPhone }))} />
            </Field>
            <Field className="md:col-span-2" help="Short public description used in the storefront footer." label="Storefront tagline">
              <TextArea rows={3} value={settings.business.storefrontTagline} onChange={(storefrontTagline) => setSettings(updateBusiness(settings, { storefrontTagline }))} />
            </Field>
          </div>
        </SettingsPanel>
      ) : null}

      {activeArea === "locations" ? (
        <SettingsPanel
          actions={<Button className="gap-2" onClick={startNewLocation} type="button" variant="secondary"><Plus aria-hidden="true" size={15} />Add location</Button>}
          description="Public presentation and operational fulfillment flags share one canonical location record."
          title="Locations"
        >
          {!initialLocations.persistenceAvailable ? (
            <InlineWarning>Apply the included database migration and verify database access before saving locations. Current values are read from the reviewed configuration fallback.</InlineWarning>
          ) : null}
          <div className="mt-5 grid overflow-hidden rounded-xl border border-black/10 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="border-b border-black/10 bg-[#fbfaf8] lg:border-b-0 lg:border-r">
              {locations.map((location) => (
                <button
                  className={cn("flex w-full items-start justify-between gap-3 border-b border-black/10 px-5 py-4 text-left last:border-b-0", workingLocation.id === location.id && "bg-white shadow-[inset_3px_0_0_#1769e0]")}
                  key={location.id}
                  onClick={() => selectLocation(location)}
                  type="button"
                >
                  <span><strong className="block text-sm">{location.name}</strong><span className="mt-1 block text-xs text-secondary">{location.publicVisible ? "Visible on storefront" : "Internal only"}</span></span>
                  {location.squareLocationId ? <CheckCircle2 aria-label="Mapped to Square" className="text-green-700" size={15} /> : <AlertTriangle aria-label="Square mapping missing" className="text-amber-600" size={15} />}
                </button>
              ))}
            </div>
            <div className="p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Location name"><TextInput value={workingLocation.name} onChange={(name) => setWorkingLocation({ ...workingLocation, name })} /></Field>
                <Field label="URL slug"><TextInput value={workingLocation.slug} onChange={(slug) => setWorkingLocation({ ...workingLocation, slug })} /></Field>
                <Field className="md:col-span-2" label="Address"><TextInput value={workingLocation.address} onChange={(address) => setWorkingLocation({ ...workingLocation, address })} /></Field>
                <Field label="Location detail"><TextInput value={workingLocation.locality} onChange={(locality) => setWorkingLocation({ ...workingLocation, locality })} /></Field>
                <Field label="Phone"><TextInput value={workingLocation.phone} onChange={(phone) => setWorkingLocation({ ...workingLocation, phone })} /></Field>
                <Field className="md:col-span-2" label="Public hours"><TextArea rows={3} value={workingLocation.hours} onChange={(hours) => setWorkingLocation({ ...workingLocation, hours })} /></Field>
                <Field help="Protected operational reference. It must be unique." label="Square location ID"><TextInput value={workingLocation.squareLocationId} onChange={(squareLocationId) => setWorkingLocation({ ...workingLocation, squareLocationId })} /></Field>
                <Field label="Display order"><TextInput type="number" value={String(workingLocation.displayOrder)} onChange={(value) => setWorkingLocation({ ...workingLocation, displayOrder: Number(value) || 0 })} /></Field>
                <Field className="md:col-span-2" label="Internal notes"><TextArea rows={3} value={workingLocation.notes} onChange={(notes) => setWorkingLocation({ ...workingLocation, notes })} /></Field>
              </div>
              <div className="mt-6 grid gap-3 border-t border-black/10 pt-5 sm:grid-cols-2">
                <Toggle checked={workingLocation.publicVisible} label="Visible on storefront" onChange={(publicVisible) => setWorkingLocation({ ...workingLocation, publicVisible })} />
                <Toggle checked={workingLocation.pickupEnabled} label="Pickup enabled" onChange={(pickupEnabled) => setWorkingLocation({ ...workingLocation, pickupEnabled })} />
                <Toggle checked={workingLocation.localDeliveryEnabled} label="Local delivery enabled" onChange={(localDeliveryEnabled) => setWorkingLocation({ ...workingLocation, localDeliveryEnabled })} />
                <Toggle checked={workingLocation.shippingFulfillmentEnabled} label="Shipping fulfillment" onChange={(shippingFulfillmentEnabled) => setWorkingLocation({ ...workingLocation, shippingFulfillmentEnabled })} />
              </div>
              <div className="mt-6 flex justify-end">
                <Button className="gap-2" disabled={isSaving || !initialLocations.persistenceAvailable} onClick={saveLocation} type="button"><Save aria-hidden="true" size={15} />Save location</Button>
              </div>
            </div>
          </div>
        </SettingsPanel>
      ) : null}

      {activeArea === "tax" ? (
        <SettingsPanel
          actions={<SavePublishActions disabled={isSaving || !initialSettings.persistenceAvailable} onPublish={() => saveSettings("publish")} onSave={() => saveSettings("save_draft")} />}
          description="Square remains the authority for the amount charged. This rate controls only the estimate shown before checkout."
          title="Taxes"
        >
          <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <p><strong>Square catalog taxes are enabled at checkout.</strong> Manual taxes are not added here, preventing duplicate taxation.</p>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field help="Locked to the payment integration used by this storefront." label="Calculation provider">
              <TextInput disabled value="Square catalog taxes" onChange={() => undefined} />
            </Field>
            <Field help="Allowed range: 0%–25%. The current storefront fallback is 8.875%." label="Storefront estimate rate (%)">
              <TextInput type="number" value={String(settings.tax.estimateRatePercent)} onChange={(value) => setSettings(updateTax(settings, { estimateRatePercent: Number(value) }))} />
            </Field>
            <Field help="Optional internal effective date for the estimate configuration." label="Effective date">
              <TextInput type="date" value={settings.tax.effectiveAt} onChange={(effectiveAt) => setSettings(updateTax(settings, { effectiveAt }))} />
            </Field>
            <div className="self-end"><Toggle checked={settings.tax.showEstimateInCart} label="Show estimated tax in cart" onChange={(showEstimateInCart) => setSettings(updateTax(settings, { showEstimateInCart }))} /></div>
          </div>
          <div className="mt-6 rounded-lg border border-black/10 bg-[#fbfaf8] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Estimate test</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div><p className="text-sm text-secondary">Tax shown for a $100.00 subtotal</p><p className="mt-1 font-display text-2xl font-semibold">${Number.isFinite(settings.tax.estimateRatePercent) ? settings.tax.estimateRatePercent.toFixed(2) : "0.00"}</p></div>
              <p className="max-w-sm text-right text-xs text-secondary">The final amount can differ when Square applies product and location-specific catalog taxes.</p>
            </div>
          </div>
        </SettingsPanel>
      ) : null}

      {activeArea === "policies" && selectedPolicy && currentPolicyFields ? (
        <SettingsPanel description="Each policy has independent drafts, publication history, and storefront visibility." title="Legal & policies">
          <div className="grid overflow-hidden rounded-xl border border-black/10 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b border-black/10 bg-[#fbfaf8] lg:border-b-0 lg:border-r">
              {policies.map((policy) => (
                <button
                  className={cn("flex w-full items-center justify-between gap-3 border-b border-black/10 px-5 py-4 text-left last:border-b-0", selectedPolicy.definition.id === policy.definition.id && "bg-white shadow-[inset_3px_0_0_#1769e0]")}
                  key={policy.definition.id}
                  onClick={() => { setSelectedPolicyId(policy.definition.id); setPreviewPolicy(false); }}
                  type="button"
                >
                  <strong className="text-sm">{policy.definition.label}</strong>
                  <span className={cn("text-xs", policy.document.status === "PUBLISHED" ? "text-green-700" : "text-amber-700")}>{policy.document.status === "PUBLISHED" ? "Published" : "Draft"}</span>
                </button>
              ))}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 p-5 md:p-6">
                <div><h3 className="font-display text-xl font-semibold">{selectedPolicy.definition.label}</h3><p className="mt-1 text-xs text-secondary">{selectedPolicy.definition.route} · Version {selectedPolicy.document.version}</p></div>
                <a className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary" href={selectedPolicy.definition.route} rel="noreferrer" target="_blank">Open published page <ExternalLink aria-hidden="true" size={13} /></a>
              </div>
              {previewPolicy ? (
                <article className="min-h-[440px] bg-[#fbfaf8] p-6 md:p-10">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Storefront preview</p>
                  <h3 className="mt-4 font-display text-3xl font-semibold">{currentPolicyFields.title}</h3>
                  {currentPolicyFields.effectiveAt ? <p className="mt-2 text-xs text-secondary">Effective {currentPolicyFields.effectiveAt}</p> : null}
                  <div className="mt-6 grid gap-4 text-sm leading-7 text-secondary">
                    {currentPolicyFields.body.split(/\n{2,}/).map((paragraph, index) => <p className="whitespace-pre-line" key={index}>{paragraph}</p>)}
                  </div>
                </article>
              ) : (
                <div className="grid gap-5 p-5 md:p-6">
                  {selectedPolicy.definition.id === "returns" ? (
                    <InlineWarning>Storefront wording is editable here. Eligibility windows, excluded item categories, and refund calculations remain enforced by the returns service and must be changed separately.</InlineWarning>
                  ) : null}
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Page title"><TextInput value={currentPolicyFields.title} onChange={(title) => setPolicyFields(updatePolicyFields(policyFields, selectedPolicy.definition.id, { title }))} /></Field>
                    <Field label="Storefront URL"><TextInput disabled value={selectedPolicy.definition.route} onChange={() => undefined} /></Field>
                  </div>
                  <Field help="Use blank lines to separate paragraphs. Scripts and arbitrary HTML are never rendered." label="Policy content">
                    <TextArea rows={15} value={currentPolicyFields.body} onChange={(body) => setPolicyFields(updatePolicyFields(policyFields, selectedPolicy.definition.id, { body }))} />
                  </Field>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Effective date"><TextInput type="date" value={currentPolicyFields.effectiveAt} onChange={(effectiveAt) => setPolicyFields(updatePolicyFields(policyFields, selectedPolicy.definition.id, { effectiveAt }))} /></Field>
                    <div className="self-end"><Toggle checked={currentPolicyFields.footerVisible} label="Show in storefront footer" onChange={(footerVisible) => setPolicyFields(updatePolicyFields(policyFields, selectedPolicy.definition.id, { footerVisible }))} /></div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 p-5 md:px-6">
                <Button onClick={() => setPreviewPolicy((current) => !current)} type="button" variant="secondary">{previewPolicy ? "Return to editor" : "Preview"}</Button>
                <div className="flex flex-wrap gap-2">
                  <Button className="gap-2" disabled={isSaving} onClick={() => savePolicy("save_draft")} type="button" variant="secondary"><Save aria-hidden="true" size={15} />Save draft</Button>
                  <Button className="gap-2" disabled={isSaving} onClick={() => savePolicy("publish")} type="button"><Rocket aria-hidden="true" size={15} />Publish</Button>
                </div>
              </div>
            </div>
          </div>
        </SettingsPanel>
      ) : null}
    </main>
  );
}

type EditableLocation = Omit<AdminStoreLocation, "id"> & { id?: string };

function SettingsPanel({ actions, children, description, title }: { actions?: ReactNode; children: ReactNode; description: string; title: string }) {
  return (
    <section className="mt-5 rounded-xl border border-black/10 bg-white">
      <header className="flex flex-col justify-between gap-4 border-b border-black/10 px-5 py-5 sm:flex-row sm:items-start md:px-6">
        <div><h2 className="font-display text-xl font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm text-secondary">{description}</p></div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <div className={cn("mt-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", notice.tone === "success" ? "border-green-200 bg-green-50 text-green-950" : notice.tone === "error" ? "border-red-200 bg-red-50 text-red-950" : "border-black/10 bg-[#fbfaf8] text-secondary")} role="status">
      {notice.tone === "success" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={17} /> : notice.tone === "error" ? <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /> : <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={17} />}
      <p>{notice.message}</p>
    </div>
  );
}

function SavePublishActions({ disabled, onPublish, onSave }: { disabled: boolean; onPublish: () => void; onSave: () => void }) {
  return <><Button className="gap-2" disabled={disabled} onClick={onSave} type="button" variant="secondary"><Save aria-hidden="true" size={15} />Save draft</Button><Button className="gap-2" disabled={disabled} onClick={onPublish} type="button"><Rocket aria-hidden="true" size={15} />Publish</Button></>;
}

function Field({ children, className, help, label }: { children: ReactNode; className?: string; help?: string; label: string }) {
  return <label className={className}><span className="block text-xs font-semibold text-[#4f555a]">{label}</span>{help ? <span className="mt-1 block text-xs leading-5 text-secondary">{help}</span> : null}<span className="mt-2 block">{children}</span></label>;
}

function TextInput({ disabled = false, onChange, type = "text", value }: { disabled?: boolean; onChange: (value: string) => void; type?: string; value: string }) {
  return <input className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none transition focus:border-black disabled:bg-[#f5f4f2] disabled:text-secondary" disabled={disabled} onChange={(event) => onChange(event.target.value)} type={type} value={value} />;
}

function TextArea({ onChange, rows, value }: { onChange: (value: string) => void; rows: number; value: string }) {
  return <textarea className="w-full resize-y rounded-md border border-black/15 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-black" onChange={(event) => onChange(event.target.value)} rows={rows} value={value} />;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-md border border-black/10 bg-[#fbfaf8] px-4 py-3 text-sm font-semibold"><span>{label}</span><input checked={checked} className="size-5 accent-[#17181c]" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>;
}

function InlineWarning({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><p>{children}</p></div>;
}

function updateBusiness(settings: StoreAdministrationSettings, patch: Partial<StoreAdministrationSettings["business"]>): StoreAdministrationSettings {
  return { ...settings, business: { ...settings.business, ...patch } };
}

function updateTax(settings: StoreAdministrationSettings, patch: Partial<StoreAdministrationSettings["tax"]>): StoreAdministrationSettings {
  return { ...settings, tax: { ...settings.tax, ...patch } };
}

function updatePolicyFields(current: Record<string, StorePolicyFields>, id: string, patch: Partial<StorePolicyFields>) {
  return { ...current, [id]: { ...current[id], ...patch } };
}

function locationForEditing(location?: AdminStoreLocation): EditableLocation {
  return location ? { ...location } : blankLocation(0);
}

function blankLocation(displayOrder: number): EditableLocation {
  return {
    id: undefined,
    slug: "",
    name: "",
    address: "",
    locality: "",
    phone: "",
    hours: "",
    notes: "",
    squareLocationId: "",
    publicVisible: true,
    displayOrder,
    pickupEnabled: true,
    localDeliveryEnabled: false,
    shippingFulfillmentEnabled: false,
    archivedAt: null,
    updatedAt: null
  };
}

async function postStoreSettings(payload: unknown) {
  const response = await fetch("/api/admin/store-settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok && result.ok !== false) return { ok: false, errors: ["The admin request failed."] };
  return result;
}

function readErrors(result: { errors?: unknown }) {
  return Array.isArray(result.errors) ? result.errors.join(" ") : "The admin request could not be completed.";
}
