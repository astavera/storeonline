import type { CSSProperties, ReactNode } from "react";
import type { CmsPageDocument, CmsSection, SectionRegistryItem, ThemeTokens } from "@/lib/cms";
import { createUnknownSectionFallback, defaultThemeTokens, mergeThemeTokens, resolveSectionRegistryItem } from "@/lib/cms";
import { cn } from "@/lib/utils";

export type CmsSectionRenderContext = {
  document: CmsPageDocument;
  registryItem: SectionRegistryItem;
  previewMode: boolean;
  theme: ThemeTokens;
  ecommerceData?: Record<string, unknown>;
};

export type PageRendererProps = {
  document: CmsPageDocument;
  previewMode?: boolean;
  ecommerceData?: Record<string, unknown>;
  renderSection?: (section: CmsSection, context: CmsSectionRenderContext) => ReactNode | undefined;
};

export function PageRenderer({ document, ecommerceData, previewMode = false, renderSection }: PageRendererProps) {
  const theme = mergeThemeTokens(defaultThemeTokens, document.themeOverrides);

  return (
    <ThemeTokenProvider document={document} theme={theme}>
      {document.sections
        .filter((section) => !section.hidden)
        .map((section) => (
          <SectionRenderer
            document={document}
            ecommerceData={ecommerceData}
            key={section.id}
            previewMode={previewMode}
            renderSection={renderSection}
            section={section}
            theme={theme}
          />
        ))}
    </ThemeTokenProvider>
  );
}

type SectionRendererProps = {
  document: CmsPageDocument;
  section: CmsSection;
  previewMode: boolean;
  theme: ThemeTokens;
  ecommerceData?: Record<string, unknown>;
  renderSection?: PageRendererProps["renderSection"];
};

export function SectionRenderer({ document, ecommerceData, previewMode, renderSection, section, theme }: SectionRendererProps) {
  const registryItem = resolveSectionRegistryItem(section.type);

  if (!registryItem) {
    return <UnknownSectionFallback section={section} />;
  }

  const context: CmsSectionRenderContext = {
    document,
    registryItem,
    previewMode,
    theme,
    ecommerceData
  };
  const customSection = renderSection?.(section, context);

  return (
    <ResponsiveVisibilityWrapper section={section}>
      {customSection ?? <GenericCmsSection registryItem={registryItem} section={section} />}
    </ResponsiveVisibilityWrapper>
  );
}

export function UnknownSectionFallback({ section }: { section: CmsSection }) {
  const fallback = createUnknownSectionFallback(section);
  const registryItem = resolveSectionRegistryItem(fallback.type);

  return (
    <ResponsiveVisibilityWrapper section={section}>
      <GenericCmsSection registryItem={registryItem ?? undefined} section={fallback} />
    </ResponsiveVisibilityWrapper>
  );
}

export function ResponsiveVisibilityWrapper({ children, section }: { children: ReactNode; section: CmsSection }) {
  return (
    <div
      className={cn(!section.visibility.desktop && "lg:hidden", !section.visibility.tablet && "md:max-lg:hidden", !section.visibility.mobile && "max-md:hidden")}
      data-cms-section-id={section.id}
      data-cms-section-type={section.type}
    >
      {children}
    </div>
  );
}

export function ThemeTokenProvider({ children, document, theme }: { children: ReactNode; document: CmsPageDocument; theme: ThemeTokens }) {
  return (
    <main data-cms-entity-id={document.entityId} data-cms-entity-type={document.entityType} data-cms-renderer="PageRenderer" style={themeToCssVars(theme)}>
      {children}
    </main>
  );
}

function GenericCmsSection({ registryItem, section }: { registryItem?: SectionRegistryItem; section: CmsSection }) {
  const isDark = section.design.backgroundTone === "dark" || section.design.backgroundTone === "brand";
  const image = section.media.image;

  return (
    <section className={cn("py-14", toneClass(section), isDark && "text-white")} data-cms-component={registryItem?.component ?? "UnknownSection"}>
      <div className={cn("container-shell", widthClass(section))}>
        <div className={cn("grid gap-8", section.layout.imagePosition === "left" || section.layout.imagePosition === "right" ? "lg:grid-cols-2 lg:items-center" : "")}>
          {image && section.layout.imagePosition === "left" ? <SectionImage section={section} /> : null}
          <div className={alignmentClass(section)}>
            {section.content.eyebrow ? <p className={cn("text-sm font-semibold uppercase tracking-[0.14em]", isDark ? "text-white/75" : "text-secondary")}>{String(section.content.eyebrow)}</p> : null}
            <h2 className="mt-3 font-display text-3xl font-semibold md:text-4xl">{String(section.content.title ?? registryItem?.label ?? section.label)}</h2>
            {section.content.body ? <p className={cn("mt-4 max-w-2xl", isDark ? "text-white/80" : "text-secondary")}>{String(section.content.body)}</p> : null}
            {section.content.primaryCtaHref ? (
              <a className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white" href={String(section.content.primaryCtaHref)}>
                {String(section.content.primaryCtaLabel || "Learn more")}
              </a>
            ) : null}
          </div>
          {image && section.layout.imagePosition !== "left" && section.layout.imagePosition !== "background" ? <SectionImage section={section} /> : null}
        </div>
        {Array.isArray(section.content.items) && section.content.items.length > 0 ? (
          <div className={cn("mt-8 grid gap-4", columnsClass(section))}>
            {section.content.items.map((item) => {
              const card = (
                <article className="surface-card h-full p-5">
                  {item.image ? <img alt={item.imageAlt || item.title || ""} className="mb-4 aspect-[4/3] w-full rounded-md object-cover" src={String(item.image)} /> : null}
                  {item.badge ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{String(item.badge)}</p> : null}
                  <h3 className="font-display text-xl font-semibold">{String(item.title ?? item.label ?? "Item")}</h3>
                  {item.body ? <p className="mt-2 text-sm text-secondary">{String(item.body)}</p> : null}
                  {item.href && item.label ? <span className="mt-4 inline-flex min-h-9 items-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white">{String(item.label)}</span> : null}
                </article>
              );

              return item.href ? (
                <a className="block h-full" href={String(item.href)} key={item.id}>
                  {card}
                </a>
              ) : (
                <div key={item.id}>{card}</div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SectionImage({ section }: { section: CmsSection }) {
  return <img alt={section.media.imageAlt || section.label} className="aspect-[4/3] h-full w-full rounded-md object-cover" decoding="async" loading="lazy" src={section.media.image} />;
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

function widthClass(section: CmsSection) {
  if (section.layout.containerWidth === "narrow") {
    return "max-w-3xl";
  }

  if (section.layout.containerWidth === "normal") {
    return "max-w-5xl";
  }

  return "";
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

function themeToCssVars(theme: ThemeTokens): CSSProperties {
  return {
    "--cms-color-primary": theme.colors.primary,
    "--cms-color-secondary": theme.colors.secondary,
    "--cms-color-accent": theme.colors.accent,
    "--cms-color-background": theme.colors.background,
    "--cms-color-surface": theme.colors.surface,
    "--cms-color-muted": theme.colors.muted,
    "--cms-color-border": theme.colors.border,
    "--cms-color-text": theme.colors.text,
    "--cms-section-padding": `${theme.spacing.sectionPadding}px`,
    "--cms-grid-gap": `${theme.grid.gap}px`
  } as CSSProperties;
}
