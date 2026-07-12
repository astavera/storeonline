"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Image, Monitor, Rocket, Save, Smartphone, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { defaultHomepageImage, homepageImagePresets, type HomepageImagePreset, type HomepageSectionConfig } from "@/config/homepage.config";
import { cn } from "@/lib/utils";

type HomepageVisualEditorProps = {
  initialPhotoPresets?: HomepageImagePreset[];
  initialSections: HomepageSectionConfig[];
};

type PreviewMode = "desktop" | "mobile";
type SaveState = {
  tone: "idle" | "success" | "error";
  message: string;
};

type AdminUploadedMediaAsset = {
  fileName: string;
  originalName: string;
  url: string;
};

type AdminMediaUploadResponse = {
  ok: boolean;
  asset?: AdminUploadedMediaAsset;
  errors?: string[];
};

const maxBrowserImageUploadBytes = 5 * 1024 * 1024;

export function HomepageVisualEditor({ initialPhotoPresets = homepageImagePresets, initialSections }: HomepageVisualEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState(() => [...initialSections].sort((a, b) => a.sortOrder - b.sortOrder));
  const [photoPresets, setPhotoPresets] = useState<HomepageImagePreset[]>(() => (initialPhotoPresets.length > 0 ? initialPhotoPresets : homepageImagePresets));
  const [selectedSectionId, setSelectedSectionId] = useState(initialSections[0]?.sectionId ?? "home.hero");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [saveState, setSaveState] = useState<SaveState>({ tone: "idle", message: "Ready" });
  const [isHydrated, setIsHydrated] = useState(false);
  const selectedSection = useMemo(() => sections.find((section) => section.sectionId === selectedSectionId) ?? sections[0], [sections, selectedSectionId]);
  const visibleSections = sections.filter((section) => section.isVisible);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    function handlePresetUse(event: MouseEvent) {
      const target = event.target instanceof Element ? (event.target.closest("[data-photo-preset-url]") as HTMLElement | null) : null;

      if (!target || !editor?.contains(target)) {
        return;
      }

      event.preventDefault();
      const imageUrl = target.dataset.photoPresetUrl || defaultHomepageImage;
      setSections((current) =>
        current.map((section) =>
          section.sectionId === selectedSectionId
            ? {
                ...section,
                backgroundImage: imageUrl,
                mediaPlacement: "background"
              }
            : section
        )
      );
    }

    editor.addEventListener("click", handlePresetUse);

    return () => editor.removeEventListener("click", handlePresetUse);
  }, [selectedSectionId]);

  function updateSelected(patch: Partial<HomepageSectionConfig>) {
    setSections((current) =>
      current.map((section) =>
        section.sectionId === selectedSectionId
          ? {
              ...section,
              ...patch
            }
          : section
      )
    );
  }

  function moveSelected(direction: -1 | 1) {
    const currentIndex = sections.findIndex((section) => section.sectionId === selectedSection.sectionId);
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= sections.length) {
      return;
    }

    const reordered = [...sections];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    setSections(reordered.map((section, index) => ({ ...section, sortOrder: (index + 1) * 10 })));
  }

  async function submit(operation: "save_draft" | "publish") {
    setSaveState({ tone: "idle", message: "Saving..." });
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        moduleId: "homepage",
        operation,
        values: {
          title: "Homepage visual edit",
          summary: "Visual storefront editor state.",
          ctaLabel: selectedSection.ctaLabel || "",
          ctaHref: selectedSection.ctaHref || "/",
          status: operation === "publish" ? "Visible" : "Draft",
          sectionOrder: sections.map((section) => section.sectionId),
          visualSections: JSON.stringify(sections),
          photoPresets: JSON.stringify(photoPresets)
        }
      })
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setSaveState({ tone: "error", message: Array.isArray(result.errors) ? result.errors.join(" ") : "Could not save." });
      return;
    }

    setSaveState({ tone: "success", message: result.storage?.message ?? "Saved." });
  }

  return (
    <main className="p-6">
      <div ref={editorRef} className="surface-card grid gap-0 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)_340px]" data-hydrated={isHydrated ? "true" : "false"} data-store-area="Admin" data-store-component="HomepageVisualEditor" data-store-section="admin.homepage-visual-editor">
        <aside className="order-1 border-b border-border bg-surface p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Homepage</p>
              <h1 className="mt-1 font-display text-xl font-semibold">Visual editor</h1>
            </div>
            <Button className="h-10 w-10 px-0" onClick={() => setPreviewMode(previewMode === "desktop" ? "mobile" : "desktop")} title="Toggle viewport" type="button" variant="secondary">
              {previewMode === "desktop" ? <Monitor aria-hidden="true" size={17} /> : <Smartphone aria-hidden="true" size={17} />}
            </Button>
          </div>

          <div className="mt-5 grid gap-2">
            {sections.map((section) => (
              <button
                className={cn(
                  "flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                  section.sectionId === selectedSection.sectionId ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary hover:border-primary"
                )}
                key={section.sectionId}
                onClick={() => setSelectedSectionId(section.sectionId)}
                type="button"
              >
                <span>
                  <span className="block font-semibold">{sectionLabel(section.sectionId)}</span>
                  <span className="block text-xs">{section.variant}</span>
                </span>
                {section.isVisible ? <Eye aria-hidden="true" size={16} /> : <EyeOff aria-hidden="true" size={16} />}
              </button>
            ))}
          </div>
        </aside>

        <section className="order-3 min-w-0 bg-surface-muted p-4 lg:order-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button className="h-10 gap-2 px-3" onClick={() => moveSelected(-1)} type="button" variant="secondary">
                <ArrowUp aria-hidden="true" size={16} />
                Up
              </Button>
              <Button className="h-10 gap-2 px-3" onClick={() => moveSelected(1)} type="button" variant="secondary">
                <ArrowDown aria-hidden="true" size={16} />
                Down
              </Button>
            </div>
            <div className="flex gap-2">
              <Button className="h-10 gap-2 px-3" onClick={() => submit("save_draft")} type="button" variant="secondary">
                <Save aria-hidden="true" size={16} />
                Draft
              </Button>
              <Button className="h-10 gap-2 px-3" onClick={() => submit("publish")} type="button">
                <Rocket aria-hidden="true" size={16} />
                Publish
              </Button>
            </div>
          </div>

          <div className={cn("mx-auto overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-all", previewMode === "mobile" ? "max-w-[390px]" : "max-w-[1120px]")}>
            <StorefrontPreview sections={visibleSections} />
          </div>

          <div
            className={cn(
              "mt-3 rounded-md border px-3 py-2 text-sm",
              saveState.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : saveState.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-border bg-surface text-secondary"
            )}
            role="status"
          >
            {saveState.message}
          </div>
        </section>

        <aside className="order-2 border-t border-border bg-surface p-4 lg:order-3 lg:border-l lg:border-t-0">
          {selectedSection ? (
            <SectionInspector
              addPhotoPreset={(preset) => setPhotoPresets((current) => [...current, preset])}
              photoPresets={photoPresets}
              removePhotoPreset={(presetId) => setPhotoPresets((current) => (current.length > 1 ? current.filter((preset) => preset.id !== presetId) : current))}
              section={selectedSection}
              updatePhotoPreset={(presetId, patch) => setPhotoPresets((current) => current.map((preset) => (preset.id === presetId ? { ...preset, ...patch } : preset)))}
              updateSection={updateSelected}
            />
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function SectionInspector({
  section,
  updateSection,
  photoPresets,
  addPhotoPreset,
  updatePhotoPreset,
  removePhotoPreset
}: {
  section: HomepageSectionConfig;
  updateSection: (patch: Partial<HomepageSectionConfig>) => void;
  photoPresets: HomepageImagePreset[];
  addPhotoPreset: (preset: HomepageImagePreset) => void;
  updatePhotoPreset: (presetId: string, patch: Partial<HomepageImagePreset>) => void;
  removePhotoPreset: (presetId: string) => void;
}) {
  const [sectionUploadState, setSectionUploadState] = useState<SaveState>({ tone: "idle", message: "" });

  function addCurrentPhotoAsPreset() {
    const nextIndex = photoPresets.length + 1;
    addPhotoPreset({
      id: `custom-${Date.now()}`,
      label: `Custom ${nextIndex}`,
      url: section.backgroundImage || defaultHomepageImage
    });
  }

  async function uploadSectionImage(file: File) {
    setSectionUploadState({ tone: "idle", message: "Uploading image..." });

    try {
      const asset = await uploadAdminImage(file, section.sectionId);
      updateSection({ backgroundImage: asset.url, mediaPlacement: "background" });
      setSectionUploadState({ tone: "success", message: `Uploaded ${asset.originalName}.` });
    } catch (error) {
      setSectionUploadState({ tone: "error", message: error instanceof Error ? error.message : "Image upload failed." });
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Selected section</p>
        <h2 className="mt-1 font-display text-xl font-semibold">{sectionLabel(section.sectionId)}</h2>
      </div>

      <ToggleRow checked={section.isVisible} label="Visible" onChange={(isVisible) => updateSection({ isVisible })} />
      <ImageUrlField label="Photo URL" onApply={(backgroundImage) => updateSection({ backgroundImage, mediaPlacement: "background" })} value={section.backgroundImage ?? ""} />
      <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
        <p className="text-sm font-semibold">Current image</p>
        <EditablePresetImage alt={`${sectionLabel(section.sectionId)} image`} className="h-24 rounded-md border border-border" src={section.backgroundImage || defaultHomepageImage} />
        <ImageUploadControl id={`section-image-upload-${section.sectionId}`} label="Upload section image" onUpload={uploadSectionImage} />
        <UploadStatus state={sectionUploadState} />
      </div>

      <PhotoPresetEditor
        addCurrentPhotoAsPreset={addCurrentPhotoAsPreset}
        addPhotoPreset={addPhotoPreset}
        photoPresets={photoPresets}
        removePhotoPreset={removePhotoPreset}
        selectPhoto={(imageUrl) => updateSection({ backgroundImage: imageUrl || defaultHomepageImage, mediaPlacement: "background" })}
        updatePhotoPreset={updatePhotoPreset}
        useFallback={() => updateSection({ backgroundImage: defaultHomepageImage, mediaPlacement: "background" })}
      />
      <TextField label="Eyebrow" onChange={(eyebrow) => updateSection({ eyebrow })} value={section.eyebrow ?? ""} />
      <TextField label="Title" onChange={(title) => updateSection({ title })} value={section.title} />
      <TextArea label="Body" onChange={(body) => updateSection({ body })} value={section.body} />
      <TextField label="Button label" onChange={(ctaLabel) => updateSection({ ctaLabel })} value={section.ctaLabel ?? ""} />
      <TextField label="Button link" onChange={(ctaHref) => updateSection({ ctaHref })} value={section.ctaHref ?? ""} />

      <SelectField
        label="Text position"
        onChange={(textPosition) => updateSection({ textPosition: textPosition as HomepageSectionConfig["textPosition"] })}
        options={["left", "center", "right"]}
        value={section.textPosition ?? "left"}
      />
      <SelectField
        label="Photo placement"
        onChange={(mediaPlacement) => updateSection({ mediaPlacement: mediaPlacement as HomepageSectionConfig["mediaPlacement"] })}
        options={["background", "left", "right", "none"]}
        value={section.mediaPlacement ?? "none"}
      />
      <SelectField
        label="Placeholder layout"
        onChange={(placeholderLayout) => updateSection({ placeholderLayout: placeholderLayout as HomepageSectionConfig["placeholderLayout"] })}
        options={["grid", "split", "rail", "stack"]}
        value={section.placeholderLayout ?? "grid"}
      />
    </div>
  );
}

function StorefrontPreview({ sections }: { sections: HomepageSectionConfig[] }) {
  return (
    <div className="bg-surface text-primary">
      <div className="flex items-center justify-between border-b border-border px-5 py-4 text-sm">
        <p className="font-display text-lg font-semibold">Modern State</p>
        <div className="hidden gap-4 text-secondary sm:flex">
          <span>Toys</span>
          <span>Balloons</span>
          <span>Gifts</span>
        </div>
      </div>
      {sections.map((section) => (
        <PreviewSection key={section.sectionId} section={section} />
      ))}
    </div>
  );
}

function PreviewSection({ section }: { section: HomepageSectionConfig }) {
  if (section.sectionId === "home.hero") {
    return (
      <section className={cn("relative min-h-[420px] bg-cover px-6 py-16 text-white", previewBackgroundClass(section), previewTextClass(section))} style={{ backgroundImage: previewBackgroundImage(section) }}>
        <div className="absolute inset-0 bg-black/45" />
        <div className={cn("relative max-w-2xl", previewWidthClass(section))}>
          {section.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow">{section.eyebrow}</p> : null}
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight">{section.title}</h2>
          <p className="mt-4 text-white/88">{section.body}</p>
          {section.ctaLabel ? <span className="mt-6 inline-flex rounded-md bg-[var(--theme-action)] px-4 py-2 text-sm font-semibold text-[var(--theme-action-foreground)]">{section.ctaLabel}</span> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={cn("px-6 py-12", section.sectionId === "home.featured-products" || section.sectionId === "home.local-storefront" ? "bg-surface-muted" : "bg-surface")}>
      <div className={cn("mb-6 max-w-2xl", previewTextClass(section), previewWidthClass(section))}>
        {section.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{section.eyebrow}</p> : null}
        <h2 className="font-display text-3xl font-semibold">{section.title}</h2>
        <p className="mt-3 text-secondary">{section.body}</p>
      </div>
      <PlaceholderLayout layout={section.placeholderLayout ?? "grid"} sectionId={section.sectionId} />
    </section>
  );
}

function PhotoPresetEditor({
  photoPresets,
  selectPhoto,
  updatePhotoPreset,
  removePhotoPreset,
  addCurrentPhotoAsPreset,
  addPhotoPreset,
  useFallback
}: {
  photoPresets: HomepageImagePreset[];
  selectPhoto: (imageUrl: string) => void;
  updatePhotoPreset: (presetId: string, patch: Partial<HomepageImagePreset>) => void;
  removePhotoPreset: (presetId: string) => void;
  addCurrentPhotoAsPreset: () => void;
  addPhotoPreset: (preset: HomepageImagePreset) => void;
  useFallback: () => void;
}) {
  const [presetUploadState, setPresetUploadState] = useState<SaveState>({ tone: "idle", message: "" });

  async function uploadNewPreset(file: File) {
    setPresetUploadState({ tone: "idle", message: "Uploading preset..." });

    try {
      const asset = await uploadAdminImage(file, "homepage-photo-preset");
      const nextIndex = photoPresets.length + 1;
      const preset = {
        id: `uploaded-${Date.now()}`,
        label: labelFromFileName(asset.originalName) || `Uploaded ${nextIndex}`,
        url: asset.url
      };
      addPhotoPreset(preset);
      selectPhoto(asset.url);
      setPresetUploadState({ tone: "success", message: `Uploaded ${asset.originalName}.` });
    } catch (error) {
      setPresetUploadState({ tone: "error", message: error instanceof Error ? error.message : "Image upload failed." });
    }
  }

  async function replacePresetPhoto(preset: HomepageImagePreset, file: File) {
    setPresetUploadState({ tone: "idle", message: `Replacing ${preset.label}...` });

    try {
      const asset = await uploadAdminImage(file, `homepage-photo-preset-${preset.id}`);
      updatePhotoPreset(preset.id, { url: asset.url });
      selectPhoto(asset.url);
      setPresetUploadState({ tone: "success", message: `Replaced ${preset.label}.` });
    } catch (error) {
      setPresetUploadState({ tone: "error", message: error instanceof Error ? error.message : "Image upload failed." });
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Photo presets</p>
          <p className="mt-1 text-xs text-secondary">Edita la libreria de fotos para usarla en cualquier seccion.</p>
        </div>
        <div className="flex gap-2">
          <Button className="h-9 px-3" onClick={addCurrentPhotoAsPreset} type="button" variant="secondary">
            Add
          </Button>
          <ImageUploadControl className="h-9 min-h-9 px-3" id="photo-preset-upload" label="Upload" onUpload={uploadNewPreset} />
        </div>
      </div>
      <UploadStatus state={presetUploadState} />

      <div className="mt-3 grid gap-3">
        {photoPresets.length > 0 ? (
          photoPresets.map((preset) => (
            <div className="grid gap-3 rounded-md border border-border bg-surface p-2 sm:grid-cols-[88px_minmax(0,1fr)]" key={preset.id}>
              <button
                className="relative h-20 w-full overflow-hidden rounded-md border border-border bg-surface-muted sm:w-[88px]"
                data-photo-preset-id={preset.id}
                data-photo-preset-url={preset.url || defaultHomepageImage}
                data-photo-preset-use="image"
                onClick={() => selectPhoto(preset.url)}
                title={`Use ${preset.label}`}
                type="button"
              >
                <EditablePresetImage alt={preset.label} className="h-full" src={preset.url} />
                <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">Use</span>
              </button>
              <div className="grid min-w-0 gap-2">
                <input
                  aria-label={`${preset.label} preset label`}
                  className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                  onChange={(event) => updatePhotoPreset(preset.id, { label: event.target.value })}
                  value={preset.label}
                />
                <ImageUrlField compact label={`${preset.label} preset URL`} onApply={(url) => updatePhotoPreset(preset.id, { url })} value={preset.url} />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    className="h-8 min-h-8 px-2 text-xs"
                    data-photo-preset-id={preset.id}
                    data-photo-preset-url={preset.url || defaultHomepageImage}
                    data-photo-preset-use="button"
                    onClick={() => selectPhoto(preset.url)}
                    type="button"
                    variant="secondary"
                  >
                    Use
                  </Button>
                  <ImageUploadControl className="h-8 min-h-8 px-2" id={`replace-preset-${safeDomId(preset.id)}`} label="Replace" onUpload={(file) => replacePresetPhoto(preset, file)} />
                  <Button className="h-8 px-2 text-xs" onClick={() => removePhotoPreset(preset.id)} type="button" variant="quiet">
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-border bg-surface p-4 text-sm text-secondary">No photos yet. The fallback photo will be used.</div>
        )}
      </div>

      <Button className="mt-3 w-full gap-2" onClick={useFallback} type="button" variant="secondary">
        <Image aria-hidden="true" size={16} />
        Use fallback photo
      </Button>
    </section>
  );
}

function ImageUploadControl({ className, id, label, onUpload }: { className?: string; id: string; label: string; onUpload: (file: File) => Promise<void> }) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <label
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary transition hover:bg-surface-muted",
        isUploading && "pointer-events-none opacity-60",
        className
      )}
      htmlFor={id}
    >
      <Upload aria-hidden="true" size={15} />
      {isUploading ? "Uploading..." : label}
      <input accept="image/gif,image/jpeg,image/png,image/svg+xml,image/webp" aria-label={label} className="sr-only" disabled={isUploading} id={id} onChange={handleChange} type="file" />
    </label>
  );
}

function UploadStatus({ state }: { state: SaveState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={cn("mt-2 rounded-md border px-2 py-1.5 text-xs", state.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : state.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-border bg-surface text-secondary")} role="status">
      {state.message}
    </p>
  );
}

function ImageUrlField({ compact = false, label, value, onApply }: { compact?: boolean; label: string; value: string; onApply: (value: string) => void }) {
  const [draftValue, setDraftValue] = useState(value);
  const inputId = `image-url-${safeDomId(label)}`;

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const hasPendingChange = draftValue !== value;

  function applyDraft() {
    onApply(draftValue.trim());
  }

  return (
    <div className={cn("block font-semibold", compact ? "text-xs" : "text-sm")}>
      <label htmlFor={inputId}>{label}</label>
      <div className={cn("mt-2 flex gap-2", compact && "mt-1")}>
        <input
          aria-label={label}
          className={cn("min-w-0 flex-1 rounded-md border border-border bg-surface font-normal outline-none focus:border-primary", compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm")}
          id={inputId}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyDraft();
            }
          }}
          placeholder="https://... or /uploads/admin/..."
          value={draftValue}
        />
        <Button className={cn("shrink-0", compact ? "h-8 min-h-8 px-2 text-xs" : "h-10 min-h-10 px-3")} disabled={!hasPendingChange} onMouseDown={(event) => event.preventDefault()} onClick={applyDraft} type="button" variant="secondary">
          Apply
        </Button>
      </div>
    </div>
  );
}

async function uploadAdminImage(file: File, context: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Upload must be an image file.");
  }

  if (file.size > maxBrowserImageUploadBytes) {
    throw new Error("Upload must be 5 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("context", context);

  const response = await fetch("/api/admin/media", {
    method: "POST",
    body: formData
  });
  const result = (await response.json()) as AdminMediaUploadResponse;

  if (!response.ok || !result.ok || !result.asset?.url) {
    throw new Error(result.errors?.join(" ") || "Image upload failed.");
  }

  return result.asset;
}

function labelFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-") || "image";
}

function thumbnailImageUrl(src: string) {
  if (!src) {
    return src;
  }

  try {
    const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL(src, baseUrl);

    if (url.hostname.includes("images.unsplash.com")) {
      url.searchParams.set("w", "480");
      url.searchParams.set("q", "70");
    }

    return url.pathname.startsWith("/uploads/") ? url.pathname : url.toString();
  } catch {
    return src;
  }
}

function EditablePresetImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-surface-muted text-secondary", className)}>
        <Image aria-hidden="true" size={24} />
      </div>
    );
  }

  return <img alt={alt} className={cn("h-full w-full object-cover", className)} decoding="async" loading="lazy" onError={() => setFailed(true)} src={thumbnailImageUrl(src)} />;
}

function PlaceholderLayout({ layout, sectionId }: { layout: NonNullable<HomepageSectionConfig["placeholderLayout"]>; sectionId: string }) {
  const labelsBySection: Record<string, string[]> = {
    "home.departments": ["Toys", "Party", "Balloons", "Gifts"],
    "home.featured-products": ["Product", "Product", "Product", "Product"],
    "home.balloon-promo": ["Latex", "Mylar", "Numbers", "Bouquets"],
    "home.local-storefront": ["86th Street", "3rd Avenue"]
  };
  const labels = labelsBySection[sectionId] ?? ["Block", "Block", "Block"];
  const gridClass = layout === "rail" ? "grid-flow-col auto-cols-[180px] overflow-hidden" : layout === "split" ? "grid-cols-1 sm:grid-cols-2" : layout === "stack" ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className={cn("grid gap-3", gridClass)}>
      {labels.map((label, index) => (
        <div className="rounded-md border border-border bg-surface p-4" key={`${label}-${index}`}>
          <div className="mb-3 flex aspect-[4/3] items-center justify-center rounded-md bg-surface-muted text-secondary">
            <Image aria-hidden="true" size={22} />
          </div>
          <p className="font-semibold">{label}</p>
          <p className="mt-1 text-xs text-secondary">Editable block</p>
        </div>
      ))}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <textarea className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => onChange(event.target.value)} rows={5} value={value} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <select className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
      {label}
      <input checked={checked} className="h-5 w-5 rounded border-border" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function sectionLabel(sectionId: string) {
  return sectionId
    .replace("home.", "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function previewBackgroundImage(section: HomepageSectionConfig) {
  return `linear-gradient(90deg, rgba(31, 41, 51, 0.72), rgba(31, 41, 51, 0.28)), url(${section.backgroundImage || defaultHomepageImage})`;
}

function previewBackgroundClass(section: HomepageSectionConfig) {
  return section.mediaPlacement === "left" ? "bg-left" : section.mediaPlacement === "right" ? "bg-right" : "bg-center";
}

function previewTextClass(section: HomepageSectionConfig) {
  return section.textPosition === "center" ? "mx-auto text-center" : section.textPosition === "right" ? "ml-auto text-right" : "text-left";
}

function previewWidthClass(section: HomepageSectionConfig) {
  return section.textPosition === "center" ? "mx-auto" : section.textPosition === "right" ? "ml-auto" : "";
}
