import type { CmsKnownSectionType, CmsPageDocument, CmsSection, CmsSectionPatch, SectionPreset, ThemePreset, ThemeTokenOverrides } from "./cms-types";
import { createCmsSection, normalizeSectionType } from "./section-registry";

export function withCmsSectionSortOrder(document: CmsPageDocument): CmsPageDocument {
  return {
    ...document,
    sections: document.sections.map((section, index) => ({
      ...section,
      layout: {
        ...section.layout,
        sortOrder: (index + 1) * 10
      }
    }))
  };
}

export function addCmsSection(document: CmsPageDocument, type: CmsKnownSectionType, input: Partial<CmsSection> = {}): CmsPageDocument {
  const section = createCmsSection(type, {
    ...input,
    id: input.id ?? uniqueCmsSectionId(document, `${document.entityId}.${type}`)
  });

  return touchCmsDocument(
    withCmsSectionSortOrder({
      ...document,
      sections: [...document.sections, section]
    })
  );
}

export function duplicateCmsSection(document: CmsPageDocument, sectionId: string): CmsPageDocument {
  const sectionIndex = document.sections.findIndex((section) => section.id === sectionId);

  if (sectionIndex < 0) {
    return document;
  }

  const source = document.sections[sectionIndex];
  const duplicatedSection: CmsSection = {
    ...source,
    id: uniqueCmsSectionId(document, `${source.id}.copy`),
    label: `${source.label} copy`,
    locked: false,
    content: {
      ...source.content,
      title: source.content.title ? `${String(source.content.title)} copy` : source.content.title,
      items: source.content.items?.map((item) => ({
        ...item,
        id: uniqueCmsSectionId(document, `${item.id}.copy`)
      }))
    },
    design: { ...source.design },
    layout: { ...source.layout },
    media: { ...source.media },
    dataSource: {
      ...source.dataSource,
      query: source.dataSource.query ? { ...source.dataSource.query } : undefined,
      manualIds: source.dataSource.manualIds ? [...source.dataSource.manualIds] : undefined
    },
    visibility: { ...source.visibility },
    advanced: { ...source.advanced }
  };
  const nextSections = [...document.sections];
  nextSections.splice(sectionIndex + 1, 0, duplicatedSection);

  return touchCmsDocument(withCmsSectionSortOrder({ ...document, sections: nextSections }));
}

export function removeCmsSection(document: CmsPageDocument, sectionId: string): CmsPageDocument {
  const section = document.sections.find((item) => item.id === sectionId);

  if (!section || document.sections.length <= 1) {
    return document;
  }

  if (section.locked) {
    return updateCmsSection(document, sectionId, { hidden: true });
  }

  return touchCmsDocument(withCmsSectionSortOrder({ ...document, sections: document.sections.filter((item) => item.id !== sectionId) }));
}

export function setCmsSectionHidden(document: CmsPageDocument, sectionId: string, hidden: boolean): CmsPageDocument {
  return updateCmsSection(document, sectionId, { hidden });
}

export function renameCmsSection(document: CmsPageDocument, sectionId: string, label: string): CmsPageDocument {
  return updateCmsSection(document, sectionId, { label: label.trim() || "Untitled section" });
}

export function changeCmsSectionVariant(document: CmsPageDocument, sectionId: string, variant: string): CmsPageDocument {
  return updateCmsSection(document, sectionId, { variant: variant.trim() || "standard" });
}

export function reorderCmsSection(document: CmsPageDocument, sourceId: string, targetId: string): CmsPageDocument {
  if (sourceId === targetId) {
    return document;
  }

  const sourceIndex = document.sections.findIndex((section) => section.id === sourceId);
  const targetIndex = document.sections.findIndex((section) => section.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return document;
  }

  const nextSections = [...document.sections];
  const [moved] = nextSections.splice(sourceIndex, 1);
  nextSections.splice(targetIndex, 0, moved);

  return touchCmsDocument(withCmsSectionSortOrder({ ...document, sections: nextSections }));
}

export function moveCmsSection(document: CmsPageDocument, sectionId: string, direction: -1 | 1): CmsPageDocument {
  const index = document.sections.findIndex((section) => section.id === sectionId);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= document.sections.length) {
    return document;
  }

  return reorderCmsSection(document, sectionId, document.sections[targetIndex].id);
}

export function updateCmsSection(document: CmsPageDocument, sectionId: string, patch: CmsSectionPatch): CmsPageDocument {
  return touchCmsDocument({
    ...document,
    sections: document.sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            ...patch,
            content: patch.content ? { ...section.content, ...patch.content } : section.content,
            design: patch.design ? { ...section.design, ...patch.design } : section.design,
            layout: patch.layout ? { ...section.layout, ...patch.layout } : section.layout,
            media: patch.media ? { ...section.media, ...patch.media } : section.media,
            dataSource: patch.dataSource ? { ...section.dataSource, ...patch.dataSource } : section.dataSource,
            visibility: patch.visibility ? { ...section.visibility, ...patch.visibility } : section.visibility,
            advanced: patch.advanced ? { ...section.advanced, ...patch.advanced } : section.advanced
          }
        : section
    )
  });
}

export function updateCmsSeo(document: CmsPageDocument, seo: Partial<CmsPageDocument["seo"]>): CmsPageDocument {
  return touchCmsDocument({
    ...document,
    seo: {
      ...document.seo,
      ...seo
    }
  });
}

export function updateCmsThemeOverrides(document: CmsPageDocument, themeOverrides: ThemeTokenOverrides): CmsPageDocument {
  return touchCmsDocument({
    ...document,
    themeOverrides: mergePartialThemeTokens(document.themeOverrides, themeOverrides)
  });
}

export function applyThemePresetToDocument(document: CmsPageDocument, preset: ThemePreset): CmsPageDocument {
  return updateCmsThemeOverrides(document, preset.tokens);
}

export function applySectionPresetToSection(document: CmsPageDocument, sectionId: string, preset: SectionPreset): CmsPageDocument {
  const section = document.sections.find((item) => item.id === sectionId);
  const normalizedType = section ? normalizeSectionType(section.type) : null;

  if (!section || !normalizedType || !preset.sectionTypes.includes(normalizedType)) {
    return document;
  }

  return updateCmsSection(document, sectionId, {
    content: preset.content,
    design: preset.design,
    layout: preset.layout,
    media: preset.media
  });
}

export function touchCmsDocument(document: CmsPageDocument, now = new Date().toISOString()): CmsPageDocument {
  return {
    ...document,
    updatedAt: now
  };
}

function uniqueCmsSectionId(document: CmsPageDocument, prefix: string) {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, "-");
  const existingIds = new Set(document.sections.map((section) => section.id));
  let candidate = safePrefix;
  let index = 1;

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `${safePrefix}-${index}`;
  }

  return candidate;
}

function mergePartialThemeTokens(current: ThemeTokenOverrides | undefined, next: ThemeTokenOverrides): ThemeTokenOverrides {
  return {
    ...current,
    ...next,
    colors: next.colors || current?.colors ? { ...current?.colors, ...next.colors } : undefined,
    typography: next.typography || current?.typography ? { ...current?.typography, ...next.typography } : undefined,
    spacing: next.spacing || current?.spacing ? { ...current?.spacing, ...next.spacing } : undefined,
    buttons: next.buttons || current?.buttons ? { ...current?.buttons, ...next.buttons } : undefined,
    cards: next.cards || current?.cards ? { ...current?.cards, ...next.cards } : undefined,
    grid: next.grid || current?.grid ? { ...current?.grid, ...next.grid } : undefined,
    images: next.images || current?.images ? { ...current?.images, ...next.images } : undefined
  };
}
