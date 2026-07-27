"use client";

import { Image as ImageIcon, LayoutDashboard, PanelRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { PageRenderer } from "@/components/cms";
import { renderStorefrontCmsSection } from "@/components/cms/storefront-cms-page";
import { SiteHeader } from "@/components/layout/site-header";
import { StorefrontBreadcrumb } from "@/components/layout/storefront-breadcrumb";
import { storefrontEditablePages } from "@/config/storefront-pages.config";
import type { CmsPageDocument, CmsSection } from "@/lib/cms";
import { cn } from "@/lib/utils";
import { BuilderPreviewFrame } from "./BuilderPreviewFrame";
import type { BuilderDevice, BuilderInspectorTab } from "./types";

export function BuilderCanvas({
  device,
  document,
  onEdit,
  onSelect,
  publicPreviewRoute,
  selectedSectionId
}: {
  device: BuilderDevice;
  document: CmsPageDocument;
  onEdit: (sectionId: string, tab: BuilderInspectorTab) => void;
  onSelect: (sectionId: string) => void;
  publicPreviewRoute?: string;
  selectedSectionId: string;
}) {
  const router = useRouter();

  function navigateFromPreviewChrome(event: MouseEvent<HTMLElement>) {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;

    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute("href");

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    const destination = editorDestinationForStorefrontHref(anchor.href);

    if (!destination) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (destination.startsWith("/admin/")) {
      router.push(destination);
      return;
    }

    window.open(destination, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="min-w-0 bg-[#efefef] p-3 lg:min-h-0 lg:overflow-auto lg:p-4">
      <div className="min-h-full rounded-[24px] border border-border bg-surface p-3 shadow-soft">
        <BuilderPreviewFrame device={device}>
          {publicPreviewRoute ? (
            <div aria-label="Storefront header preview" data-builder-preview-chrome="header" onClick={navigateFromPreviewChrome}>
              <SiteHeader />
            </div>
          ) : null}
          {publicPreviewRoute && shouldShowPreviewBreadcrumb(document, publicPreviewRoute) ? (
            <div className="bg-surface pt-8" data-builder-preview-chrome="breadcrumb" onClick={navigateFromPreviewChrome}>
              <div className="container-shell">
                <StorefrontBreadcrumb currentLabel={breadcrumbLabelForDocument(document)} />
              </div>
            </div>
          ) : null}
          <PageRenderer
            document={document}
            previewMode
            renderSection={(section, context) => {
              const visualSection = renderStorefrontCmsSection(section, context, { includeGlobalFrame: true });

              return (
                <BuilderCanvasSection isSelected={selectedSectionId === section.id} onEdit={onEdit} onSelect={onSelect} section={section}>
                  {visualSection ?? <BuilderFallbackSection section={section} />}
                </BuilderCanvasSection>
              );
            }}
          />
        </BuilderPreviewFrame>
      </div>
    </section>
  );
}

function shouldShowPreviewBreadcrumb(document: CmsPageDocument, publicPreviewRoute: string) {
  return publicPreviewRoute !== "/" && !(document.entityType === "landing" && document.entityId === "shop");
}

function breadcrumbLabelForDocument(document: CmsPageDocument) {
  return document.title.replace(/^(Landing|Department|Holiday|Product|Location|Policy):\s*/i, "");
}

function editorDestinationForStorefrontHref(href: string) {
  const url = safeUrl(href);

  if (!url) {
    return "";
  }

  if (url.origin !== window.location.origin) {
    return url.href;
  }

  const path = normalizeInternalPath(url.pathname);

  if (path === "/") {
    return "/admin/homepage";
  }

  const page = storefrontEditablePages.find((editablePage) => normalizeInternalPath(editablePage.route) === path);

  if (!page) {
    return url.href;
  }

  return `/admin/homepage?scope=${encodeURIComponent(page.scope)}&id=${encodeURIComponent(page.entityId)}`;
}

function safeUrl(href: string) {
  try {
    return new URL(href, window.location.origin);
  } catch {
    return null;
  }
}

function normalizeInternalPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");

  return normalized || "/";
}

function BuilderCanvasSection({
  isSelected,
  onEdit,
  onSelect,
  section,
  children
}: {
  children: ReactNode;
  isSelected: boolean;
  onEdit: (sectionId: string, tab: BuilderInspectorTab) => void;
  onSelect: (sectionId: string) => void;
  section: CmsSection;
}) {
  function selectFromCanvas(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();

    const editElement = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cms-edit-field]") : null;
    const editField = editElement?.dataset.cmsEditField;

    onSelect(section.id);

    if (editField) {
      onEdit(section.id, inspectorTabForEditField(editField));
    }
  }

  return (
    <section
      className={cn(
        "group relative cursor-pointer overflow-hidden outline-none transition",
        isSelected ? "z-10 ring-2 ring-primary ring-offset-2 ring-offset-surface" : "hover:ring-1 hover:ring-primary/40"
      )}
      data-builder-section-id={section.id}
      onClick={selectFromCanvas}
    >
      <div className="absolute left-3 top-3 z-20 hidden rounded-pill bg-primary px-3 py-1 text-xs font-black text-white shadow-soft group-hover:block group-focus-within:block">
        {section.label}
      </div>
      <div className="absolute right-3 top-3 z-20 hidden gap-1 group-hover:flex group-focus-within:flex">
        <HotspotButton label="Text" onClick={() => onEdit(section.id, "content")}>
          <PanelRight aria-hidden="true" size={14} />
        </HotspotButton>
        <HotspotButton label="Image" onClick={() => onEdit(section.id, "media")}>
          <ImageIcon aria-hidden="true" size={14} />
        </HotspotButton>
        <HotspotButton label="Layout" onClick={() => onEdit(section.id, "layout")}>
          <LayoutDashboard aria-hidden="true" size={14} />
        </HotspotButton>
      </div>
      <div>{children}</div>
    </section>
  );
}

function inspectorTabForEditField(field: string): BuilderInspectorTab {
  if (field.toLowerCase().includes("image")) {
    return "media";
  }

  if (field.toLowerCase().includes("product") || field === "linkedProducts") {
    return "data";
  }

  return "content";
}

function HotspotButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-primary shadow-soft"
      onClick={(event) => editFromChild(event, onClick)}
      title={label}
      type="button"
    >
      {children}
      {label}
    </button>
  );
}

function editFromChild(event: MouseEvent, callback: () => void) {
  event.preventDefault();
  event.stopPropagation();
  callback();
}

function BuilderFallbackSection({ section }: { section: CmsSection }) {
  const isDark = section.design.backgroundTone === "dark" || section.design.backgroundTone === "brand";
  const image = section.media.image;

  return (
    <section className={cn("px-6 py-12", toneClass(section), isDark && "text-white")}>
      <div className={cn("container-shell grid gap-8", image && section.layout.imagePosition !== "background" && "lg:grid-cols-2 lg:items-center")}>
        {image && section.layout.imagePosition === "left" ? <img alt={section.media.imageAlt || section.label} className="aspect-[4/3] w-full rounded-md object-cover" src={image} /> : null}
        <div className={cn("max-w-2xl", alignmentClass(section))}>
          {section.content.eyebrow ? <p className={cn("text-sm font-semibold uppercase tracking-[0.14em]", isDark ? "text-white/75" : "text-secondary")}>{String(section.content.eyebrow)}</p> : null}
          <h3 className="mt-3 font-display text-3xl font-semibold">{String(section.content.title || section.label)}</h3>
          {section.content.body ? <p className={cn("mt-4", isDark ? "text-white/80" : "text-secondary")}>{String(section.content.body)}</p> : null}
          {section.content.primaryCtaLabel ? <span className="mt-6 inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">{String(section.content.primaryCtaLabel)}</span> : null}
        </div>
        {image && section.layout.imagePosition !== "left" && section.layout.imagePosition !== "background" ? <img alt={section.media.imageAlt || section.label} className="aspect-[4/3] w-full rounded-md object-cover" src={image} /> : null}
      </div>
      {section.content.items?.length ? (
        <div className={cn("container-shell mt-8 grid gap-3 text-left", columnsClass(section))}>
          {section.content.items.slice(0, 6).map((item) => (
            <span className="rounded-md border border-border bg-surface p-4 text-primary" key={item.id}>
              <span className="block font-semibold">{String(item.title ?? item.label ?? "Item")}</span>
              {item.body ? <span className="mt-1 block text-sm text-secondary">{String(item.body)}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function toneClass(section: CmsSection) {
  if (section.design.backgroundTone === "muted") {
    return "bg-surface-muted";
  }

  if (section.design.backgroundTone === "brand" || section.design.backgroundTone === "dark") {
    return "bg-primary";
  }

  if (section.design.backgroundTone === "accent") {
    return "bg-[rgba(255,221,87,0.18)]";
  }

  return "bg-surface";
}

function alignmentClass(section: CmsSection) {
  if (section.layout.alignment === "center") {
    return "mx-auto text-center";
  }

  if (section.layout.alignment === "right") {
    return "ml-auto text-right";
  }

  return "text-left";
}

function columnsClass(section: CmsSection) {
  if (section.layout.columns === 2) {
    return "md:grid-cols-2";
  }

  if (section.layout.columns === 4) {
    return "md:grid-cols-2 lg:grid-cols-4";
  }

  return "md:grid-cols-3";
}
