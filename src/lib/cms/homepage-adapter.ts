import type { HomepageSectionConfig } from "@/config/homepage.config";
import type { HomepageSeoConfig } from "@/features/admin/services/homepage-visual-editor-service";
import type { CmsKnownSectionType, CmsPageDocument, CmsSection } from "./cms-types";
import { createCmsPageDocument } from "./page-templates";
import { createCmsSection, normalizeSectionType } from "./section-registry";

const homepageSectionTypeMap: Record<string, CmsKnownSectionType> = {
  hero: "hero",
  departments: "departments",
  "product-grid": "product-grid",
  promo: "promo",
  storefront: "storefront",
  content: "content",
  "image-banner": "image-banner",
  "feature-grid": "feature-grid",
  "split-media": "split-media",
  "trust-bar": "trust-bar",
  newsletter: "newsletter",
  faq: "faq"
};

export function homepageSectionsToCmsPageDocument(input: {
  sections: HomepageSectionConfig[];
  seo: HomepageSeoConfig;
  status?: CmsPageDocument["status"];
  now?: string;
}): CmsPageDocument {
  const now = input.now ?? new Date().toISOString();

  return createCmsPageDocument("homepage", "home", {
    title: input.seo.title,
    slug: input.seo.canonicalUrl || "/",
    seo: {
      title: input.seo.title,
      description: input.seo.description,
      ogTitle: input.seo.ogTitle,
      ogDescription: input.seo.ogDescription,
      ogImage: input.seo.ogImage,
      canonicalUrl: input.seo.canonicalUrl,
      indexable: input.seo.indexable
    },
    sections: input.sections.map(homepageSectionToCmsSection),
    status: input.status ?? "DRAFT",
    createdAt: now,
    updatedAt: now,
    publishedAt: input.status === "PUBLISHED" ? now : null
  });
}

export function homepageSectionToCmsSection(section: HomepageSectionConfig): CmsSection {
  const sectionType = normalizeHomepageSectionType(section);

  return createCmsSection(sectionType, {
    id: section.sectionId,
    variant: section.variant,
    label: section.title,
    hidden: section.isVisible === false,
    content: {
      eyebrow: section.eyebrow,
      title: section.title,
      body: section.body,
      primaryCtaLabel: section.ctaLabel,
      primaryCtaHref: section.ctaHref,
      secondaryCtaLabel: section.secondaryCtaLabel,
      secondaryCtaHref: section.secondaryCtaHref,
      items: section.items?.map((item) => ({ ...item }))
    },
    design: {
      backgroundTone: section.backgroundTone,
      heroSize: section.heroSize
    },
    layout: {
      alignment: section.textPosition,
      containerWidth: section.contentWidth,
      columns: section.columns,
      imagePosition: section.mediaPlacement,
      placeholderLayout: section.placeholderLayout,
      paddingTop: section.verticalPadding === "spacious" ? 80 : section.verticalPadding === "compact" ? 32 : 56,
      paddingBottom: section.verticalPadding === "spacious" ? 80 : section.verticalPadding === "compact" ? 32 : 56,
      sortOrder: section.sortOrder
    },
    media: {
      image: section.backgroundImage ?? section.mediaImage,
      imageAlt: section.imageAlt
    },
    dataSource: dataSourceForHomepageSection(section)
  });
}

function normalizeHomepageSectionType(section: HomepageSectionConfig): CmsKnownSectionType {
  const rawType = section.sectionType ?? "content";
  const mapped = homepageSectionTypeMap[rawType] ?? normalizeSectionType(rawType);

  return mapped ?? "content";
}

function dataSourceForHomepageSection(section: HomepageSectionConfig): CmsSection["dataSource"] {
  if (section.sectionType === "product-grid") {
    return {
      type: "productPlacement",
      id: "homepage-featured"
    };
  }

  if (section.sectionType === "departments") {
    return {
      type: "department"
    };
  }

  if (section.sectionType === "storefront") {
    return {
      type: "locationData"
    };
  }

  return {
    type: "manual"
  };
}
