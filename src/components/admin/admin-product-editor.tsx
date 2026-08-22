/**
 * Edits website-owned merchandising for one real Square catalog variation.
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Save
} from "lucide-react";
import { useMemo, useState } from "react";
import { SearchableMultiSelect } from "@/components/admin/searchable-select";
import {
  fulfillmentModeLabel,
  productAgeGroups,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import {
  applyWebsiteProductContent,
  createEmptyWebsiteProductContent,
  websiteCategoryLabel,
  websiteProductReadinessIssues,
  websiteSurfaceOptions,
  type WebsiteBrand,
  type WebsiteCategory,
  type WebsiteHoliday,
  type WebsiteProductContent,
  type WebsiteProductPlacement,
  type WebsiteSurface
} from "@/features/catalog/services/website-merchandising-service";
import { formatMoney } from "@/lib/utils";

type AdminProductEditorProps = {
  brands: WebsiteBrand[];
  categories: WebsiteCategory[];
  holidays: WebsiteHoliday[];
  initialPlacement: WebsiteProductPlacement;
  initiallySaved: boolean;
  product: StorefrontProduct;
};

type SaveResponse = {
  ok: boolean;
  error?: string;
  issues?: string[];
  placement?: WebsiteProductPlacement;
};

const fulfillmentOptions: ReadonlyArray<{ id: FulfillmentMode; label: string }> = [
  { id: "pickup", label: fulfillmentModeLabel("pickup") },
  { id: "local-delivery", label: fulfillmentModeLabel("local-delivery") },
  { id: "shipping", label: fulfillmentModeLabel("shipping") }
];

export function AdminProductEditor({
  brands,
  categories,
  holidays,
  initialPlacement,
  initiallySaved,
  product
}: AdminProductEditorProps) {
  const [baseline, setBaseline] = useState(() => clonePlacement(initialPlacement));
  const [draft, setDraft] = useState(() => clonePlacement(initialPlacement));
  const [isConfigured, setIsConfigured] = useState(initiallySaved);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const resolvedProduct = useMemo(
    () => applyWebsiteProductContent(product, draft.content),
    [draft.content, product]
  );
  const readinessIssues = useMemo(
    () => websiteProductReadinessIssues(product, draft, categories, holidays),
    [categories, draft, holidays, product]
  );
  const isDirty = !placementsMatch(draft, baseline);
  const publishBlocked = draft.visible && readinessIssues.length > 0;

  function updateDraft(patch: Partial<WebsiteProductPlacement>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
    setSuccess("");
  }

  function updateContent(field: keyof WebsiteProductContent, value: string) {
    updateDraft({
      content: {
        ...createEmptyWebsiteProductContent(),
        ...draft.content,
        [field]: value
      }
    });
  }

  function toggleHoliday(holidayId: string) {
    const holiday = holidays.find((candidate) => candidate.id === holidayId);
    if (!holiday) return;

    const assigned = draft.holidayAssignments.some((assignment) => assignment.holidayId === holidayId);
    updateDraft({
      holidayAssignments: assigned
        ? draft.holidayAssignments.filter((assignment) => assignment.holidayId !== holidayId)
        : [...draft.holidayAssignments, { holidayId, startsAt: holiday.startDate, endsAt: holiday.endDate }]
    });
  }

  function updateHolidayDate(holidayId: string, field: "startsAt" | "endsAt", value: string) {
    updateDraft({
      holidayAssignments: draft.holidayAssignments.map((assignment) =>
        assignment.holidayId === holidayId ? { ...assignment, [field]: value } : assignment
      )
    });
  }

  async function saveProduct() {
    if (!isDirty || publishBlocked || isSaving) return;

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/full-catalog-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement: draft })
      });
      const result = await readSaveResponse(response);
      if (!response.ok || !result.ok || !result.placement) {
        throw new Error(result.error || "The website settings could not be saved.");
      }

      const savedPlacement = clonePlacement(result.placement);
      setDraft(savedPlacement);
      setBaseline(savedPlacement);
      setIsConfigured(true);
      setSuccess(savedPlacement.visible ? "Product saved and visible on the website." : "Product saved as a private website draft.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The website settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="admin-page admin-product-editor" data-store-component="AdminProductEditor">
      <header className="admin-product-editor-header">
        <div>
          <Link className="admin-product-editor-back" href="/admin/products">
            <ArrowLeft aria-hidden="true" size={14} /> Products
          </Link>
          <div className="admin-product-editor-heading-row">
            <div>
              <p className="admin-eyebrow">Product variation</p>
              <h2 className="admin-page-title">{product.name}</h2>
            </div>
            <span className="admin-source-badge">Square · read only</span>
          </div>
          <p className="admin-lede">Manage how this synchronized variation appears and can be fulfilled on the website.</p>
        </div>
        <div className="admin-product-editor-actions">
          {isConfigured && baseline.visible ? (
            <Link
              className="admin-button-secondary"
              href={`/products/${encodeURIComponent(applyWebsiteProductContent(product, baseline.content).slug)}`}
              target="_blank"
            >
              <ExternalLink aria-hidden="true" size={15} /> View product
            </Link>
          ) : null}
          <span className={isDirty ? "admin-unsaved-state admin-unsaved-state--dirty" : "admin-unsaved-state"}>
            {isDirty ? "Unsaved changes" : "Up to date"}
          </span>
          <button
            className="admin-button"
            disabled={!isDirty || publishBlocked || isSaving}
            onClick={saveProduct}
            type="button"
          >
            {isSaving ? <LoaderCircle aria-hidden="true" className="admin-loading-mark" size={15} /> : <Save aria-hidden="true" size={15} />}
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </header>

      {error ? <p className="admin-product-editor-message admin-product-editor-message--error" role="alert">{error}</p> : null}
      {success ? <p className="admin-product-editor-message admin-product-editor-message--success" role="status">{success}</p> : null}

      <div className="admin-product-editor-grid">
        <aside className="admin-product-source-card">
          <div className="admin-product-source-image-wrap">
            <Image
              alt={product.name}
              className="admin-product-source-image"
              fill
              sizes="(min-width: 1024px) 320px, 100vw"
              src={product.imageUrl || "/images/product-fallback.svg"}
              unoptimized
            />
          </div>
          <div className="admin-product-source-copy">
            <div className="admin-product-source-title-row">
              <div>
                <p className="admin-product-source-kicker">Square catalog record</p>
                <h2>{product.name}</h2>
              </div>
              <LockKeyhole aria-label="Read only" size={17} />
            </div>
            <p className="admin-product-source-description">
              {product.shortDescription || product.description || "No product description is available from the synchronized catalog."}
            </p>
            <dl className="admin-product-source-facts">
              <SourceFact label="Price" value={product.priceAvailable === false ? "Unavailable" : formatMoney(product.priceCents)} />
              <SourceFact label="Department" value={product.department || "Uncategorized"} />
              <SourceFact label="Inventory" value={formatInventory(product)} />
              <SourceFact label="Website setup" value={isConfigured ? "Configured" : "Not configured"} />
              <SourceFact label="SKU" value={product.sku || "Not assigned"} />
              <SourceFact label="UPC / GTIN" value={product.upc || "Not assigned"} />
              <SourceFact label="Square item ID" value={product.id} wide />
              <SourceFact label="Variation ID" value={product.squareVariationId} wide />
              <SourceFact label="Vendor" value={product.squareVendorNames?.join(", ") || "Not assigned"} wide />
            </dl>
            <p className="admin-product-source-note">Name, image, price and inventory stay controlled by Square.</p>
          </div>
        </aside>

        <section className="admin-product-settings" aria-label="Website product settings">
          <EditorSection
            description="Keep the product private while setup is incomplete, then publish it when every requirement is ready."
            title="Publication"
          >
            <div className="admin-visibility-control" role="group" aria-label="Website visibility">
              <button
                aria-pressed={!draft.visible}
                className={!draft.visible ? "is-active" : ""}
                onClick={() => updateDraft({ visible: false })}
                type="button"
              >
                <EyeOff aria-hidden="true" size={15} /> Private
              </button>
              <button
                aria-pressed={draft.visible}
                className={draft.visible ? "is-active" : ""}
                disabled={readinessIssues.length > 0}
                onClick={() => updateDraft({ visible: true })}
                type="button"
              >
                <Eye aria-hidden="true" size={15} /> Visible
              </button>
            </div>
            {readinessIssues.length > 0 ? (
              <div className="admin-product-readiness admin-product-readiness--warning">
                <CircleAlert aria-hidden="true" size={17} />
                <div>
                  <p>Complete setup before publishing</p>
                  <ul>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                </div>
              </div>
            ) : (
              <div className="admin-product-readiness admin-product-readiness--ready">
                <CheckCircle2 aria-hidden="true" size={17} />
                <p>This variation is ready to publish.</p>
              </div>
            )}
          </EditorSection>

          <EditorSection
            description="Leave an override blank to keep the synchronized Square value. These fields only change the website."
            title="Website content"
          >
            <div className="admin-product-form-grid">
              <EditorField hint="Square title is used when blank." label="Website title">
                <input
                  aria-label="Website title"
                  className="admin-product-text-input"
                  maxLength={120}
                  onChange={(event) => updateContent("displayName", event.target.value)}
                  placeholder={product.name}
                  type="text"
                  value={draft.content?.displayName ?? ""}
                />
              </EditorField>
              <EditorField hint="Lowercase URL handle." label="Product URL">
                <div className="admin-product-slug-field">
                  <span>/products/</span>
                  <input
                    aria-label="Product URL"
                    maxLength={120}
                    onChange={(event) => updateContent("slug", normalizeProductSlug(event.target.value))}
                    placeholder={product.slug}
                    type="text"
                    value={draft.content?.slug ?? ""}
                  />
                </div>
              </EditorField>
              <EditorField hint="Optional label on product cards." label="Badge">
                <input
                  aria-label="Product badge"
                  className="admin-product-text-input"
                  maxLength={40}
                  onChange={(event) => updateContent("badge", event.target.value)}
                  placeholder="New, Best seller, Limited..."
                  type="text"
                  value={draft.content?.badge ?? ""}
                />
              </EditorField>
              <EditorField hint="Internal path or HTTPS URL." label="Website image">
                <input
                  aria-label="Website image URL"
                  className="admin-product-text-input"
                  maxLength={500}
                  onChange={(event) => updateContent("imageUrl", event.target.value)}
                  placeholder={product.imageUrl}
                  type="url"
                  value={draft.content?.imageUrl ?? ""}
                />
              </EditorField>
              <EditorField hint="Required when using a website image." label="Image alt text">
                <input
                  aria-label="Website image alt text"
                  className="admin-product-text-input"
                  maxLength={160}
                  onChange={(event) => updateContent("imageAlt", event.target.value)}
                  placeholder={product.imageAlt || product.name}
                  type="text"
                  value={draft.content?.imageAlt ?? ""}
                />
              </EditorField>
            </div>
            <EditorField hint={`${(draft.content?.shortDescription ?? "").length}/240`} label="Short description">
              <textarea
                aria-label="Website short description"
                className="admin-product-textarea admin-product-textarea--short"
                maxLength={240}
                onChange={(event) => updateContent("shortDescription", event.target.value)}
                placeholder={product.shortDescription}
                value={draft.content?.shortDescription ?? ""}
              />
            </EditorField>
            <EditorField hint={`${(draft.content?.description ?? "").length}/5000`} label="Full description">
              <textarea
                aria-label="Website full description"
                className="admin-product-textarea"
                maxLength={5000}
                onChange={(event) => updateContent("description", event.target.value)}
                placeholder={product.description}
                value={draft.content?.description ?? ""}
              />
            </EditorField>
          </EditorSection>

          <EditorSection
            description="Optional search metadata. The website title and short description remain the fallback."
            title="Search and sharing"
          >
            <div className="admin-product-form-grid">
              <EditorField hint={`${(draft.content?.seoTitle ?? "").length}/70`} label="SEO title">
                <input
                  aria-label="SEO title"
                  className="admin-product-text-input"
                  maxLength={70}
                  onChange={(event) => updateContent("seoTitle", event.target.value)}
                  placeholder={resolvedProduct.name}
                  type="text"
                  value={draft.content?.seoTitle ?? ""}
                />
              </EditorField>
              <EditorField hint={`${(draft.content?.seoDescription ?? "").length}/180`} label="SEO description">
                <textarea
                  aria-label="SEO description"
                  className="admin-product-textarea admin-product-textarea--short"
                  maxLength={180}
                  onChange={(event) => updateContent("seoDescription", event.target.value)}
                  placeholder={resolvedProduct.shortDescription}
                  value={draft.content?.seoDescription ?? ""}
                />
              </EditorField>
            </div>
          </EditorSection>

          <EditorSection description="These labels power website navigation and product discovery." title="Organization">
            <div className="admin-product-form-grid">
              <EditorField label="Website categories">
                {categories.length > 0 ? (
                  <SearchableMultiSelect
                    emptyLabel="Choose categories"
                    label="Website categories"
                    onToggle={(categoryId) => updateDraft({ categoryIds: toggleValue(draft.categoryIds, categoryId) })}
                    options={categories.map((category) => ({
                      id: category.id,
                      label: `${websiteCategoryLabel(category, categories)}${category.visible ? "" : " · hidden"}`
                    }))}
                    values={draft.categoryIds}
                  />
                ) : <ConfigurationLink href="/admin/products?tab=publishing#structure-categories" label="Create website categories first" />}
              </EditorField>
              <EditorField label="Brands">
                {brands.length > 0 ? (
                  <SearchableMultiSelect
                    emptyLabel="Choose brands"
                    label="Brands"
                    onToggle={(brandId) => updateDraft({ brandIds: toggleValue(draft.brandIds, brandId) })}
                    options={brands.map((brand) => ({ id: brand.id, label: `${brand.name}${brand.visible ? "" : " · hidden"}` }))}
                    values={draft.brandIds}
                  />
                ) : <ConfigurationLink href="/admin/products?tab=publishing#structure-brands" label="No website brands configured" />}
              </EditorField>
            </div>
          </EditorSection>

          <EditorSection description="Choose where this variation appears and how customers can receive it." title="Website reach">
            <div className="admin-product-form-grid">
              <EditorField label="Visible in">
                <SearchableMultiSelect
                  emptyLabel="Choose website areas"
                  label="Visible in"
                  onToggle={(surfaceId) => updateDraft({ surfaceIds: toggleValue<WebsiteSurface>(draft.surfaceIds, surfaceId) })}
                  options={websiteSurfaceOptions}
                  values={draft.surfaceIds}
                />
              </EditorField>
              <EditorField label="Fulfillment">
                <SearchableMultiSelect
                  emptyLabel="Choose fulfillment"
                  label="Fulfillment"
                  onToggle={(mode) => updateDraft({ fulfillmentModes: toggleValue<FulfillmentMode>(draft.fulfillmentModes, mode) })}
                  options={fulfillmentOptions}
                  values={draft.fulfillmentModes}
                />
              </EditorField>
              <EditorField label="Age range">
                <SearchableMultiSelect
                  emptyLabel="Choose age ranges"
                  label="Age range"
                  onToggle={(ageGroup) => updateDraft({ ageGroups: toggleValue<ProductAgeGroup>(draft.ageGroups, ageGroup) })}
                  options={productAgeGroups.map((ageGroup) => ({ id: ageGroup.id, label: ageGroup.label }))}
                  values={draft.ageGroups}
                />
              </EditorField>
              <EditorField hint="Lower numbers appear first." label="Display order">
                <input
                  className="admin-product-number-input"
                  min={0}
                  onChange={(event) => updateDraft({ sortOrder: Math.max(0, Number(event.target.value) || 0) })}
                  type="number"
                  value={draft.sortOrder}
                />
              </EditorField>
            </div>
          </EditorSection>

          <EditorSection description="Optional date-bound placements for active holiday collections." title="Campaigns">
            {holidays.length > 0 ? (
              <>
                <SearchableMultiSelect
                  emptyLabel="No holiday campaigns"
                  label="Holiday campaigns"
                  onToggle={toggleHoliday}
                  options={holidays.map((holiday) => ({ id: holiday.id, label: `${holiday.name}${holiday.visible ? "" : " · hidden"}` }))}
                  values={draft.holidayAssignments.map((assignment) => assignment.holidayId)}
                />
                {draft.holidayAssignments.length > 0 ? (
                  <div className="admin-campaign-list">
                    {draft.holidayAssignments.map((assignment) => {
                      const holiday = holidays.find((candidate) => candidate.id === assignment.holidayId);
                      if (!holiday) return null;
                      return (
                        <div className="admin-campaign-row" key={assignment.holidayId}>
                          <p>{holiday.name}</p>
                          <label>
                            Starts
                            <input
                              max={holiday.endDate}
                              min={holiday.startDate}
                              onChange={(event) => updateHolidayDate(holiday.id, "startsAt", event.target.value)}
                              type="date"
                              value={assignment.startsAt}
                            />
                          </label>
                          <label>
                            Ends
                            <input
                              max={holiday.endDate}
                              min={holiday.startDate}
                              onChange={(event) => updateHolidayDate(holiday.id, "endsAt", event.target.value)}
                              type="date"
                              value={assignment.endsAt}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : <ConfigurationLink href="/admin/products?tab=publishing#structure-holidays" label="No holiday campaigns configured" />}
          </EditorSection>

          <footer className="admin-product-editor-footer">
            <div>
              <p>{draft.visible ? "Visible after saving" : "Private after saving"}</p>
              <span>{isDirty ? "Review and save your changes." : "No pending changes."}</span>
            </div>
            <button
              className="admin-button"
              disabled={!isDirty || publishBlocked || isSaving}
              onClick={saveProduct}
              type="button"
            >
              {isSaving ? <LoaderCircle aria-hidden="true" className="admin-loading-mark" size={15} /> : <Save aria-hidden="true" size={15} />}
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}

function EditorSection({ children, description, title }: { children: React.ReactNode; description: string; title: string }) {
  return (
    <section className="admin-product-settings-section">
      <div className="admin-product-settings-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="admin-product-settings-body">{children}</div>
    </section>
  );
}

function EditorField({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return (
    <div className="admin-product-field">
      <div className="admin-product-field-label"><span>{label}</span>{hint ? <small>{hint}</small> : null}</div>
      {children}
    </div>
  );
}

function ConfigurationLink({ href, label }: { href: string; label: string }) {
  return <Link className="admin-product-configuration-link" href={href}>{label}</Link>;
}

function SourceFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "admin-product-source-fact admin-product-source-fact--wide" : "admin-product-source-fact"}><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

async function readSaveResponse(response: Response): Promise<SaveResponse> {
  try {
    return await response.json() as SaveResponse;
  } catch {
    return { ok: false, error: "The catalog service returned an invalid response." };
  }
}

function clonePlacement(placement: WebsiteProductPlacement): WebsiteProductPlacement {
  return {
    ...placement,
    categoryIds: [...placement.categoryIds],
    brandIds: [...placement.brandIds],
    holidayAssignments: placement.holidayAssignments.map((assignment) => ({ ...assignment })),
    ageGroups: [...placement.ageGroups],
    fulfillmentModes: [...placement.fulfillmentModes],
    surfaceIds: [...placement.surfaceIds],
    content: placement.content ? { ...placement.content } : undefined
  };
}

function placementsMatch(left: WebsiteProductPlacement, right: WebsiteProductPlacement) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function normalizeProductSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatInventory(product: StorefrontProduct) {
  if (product.inventoryTracked === false) return "Not tracked";
  if (typeof product.availableQuantity === "number") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(product.availableQuantity)} available`;
  }
  if (product.inventoryStatus === "out-of-stock") return "Out of stock";
  if (product.inventoryStatus === "limited") return "Limited";
  if (product.inventoryStatus === "special-order") return "Special order";
  return "In stock";
}
