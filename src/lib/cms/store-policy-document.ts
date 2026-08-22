/**
 * Maps the focused policy editor to the shared versioned CMS document format.
 */

import type { StorePolicyDefinition } from "@/config/store-administration.config";
import type { CmsPageDocument, CmsSection } from "./cms-types";
import { createCmsPageDocumentForScope } from "./page-templates";
import { createCmsSection } from "./section-registry";

export type StorePolicyFields = {
  title: string;
  body: string;
  route: string;
  footerVisible: boolean;
  effectiveAt: string;
};

export function createStorePolicyDocument(definition: StorePolicyDefinition): CmsPageDocument {
  const document = createCmsPageDocumentForScope("policy", definition.id, {
    title: definition.defaultTitle,
    slug: definition.route
  });

  return {
    ...document,
    sections: [createPolicyContentSection(definition, {
      title: definition.defaultTitle,
      body: definition.defaultBody,
      route: definition.route,
      footerVisible: definition.footerVisible,
      effectiveAt: ""
    })]
  };
}

export function readStorePolicyFields(
  document: CmsPageDocument,
  definition: StorePolicyDefinition
): StorePolicyFields {
  const section = findPolicyContentSection(document, definition.id);
  return {
    title: String(section?.content.title || document.title || definition.defaultTitle),
    body: String(section?.content.body || definition.defaultBody),
    route: document.slug || definition.route,
    footerVisible: section?.advanced.footerVisible !== false,
    effectiveAt: typeof section?.advanced.effectiveAt === "string" ? section.advanced.effectiveAt : ""
  };
}

export function updateStorePolicyDocument(input: {
  definition: StorePolicyDefinition;
  document: CmsPageDocument;
  fields: StorePolicyFields;
}) {
  const nextSection = createPolicyContentSection(input.definition, input.fields);
  const currentIndex = input.document.sections.findIndex(
    (section) => section.id === `policy.${input.definition.id}`
  );
  const sections = [...input.document.sections];
  if (currentIndex >= 0) sections[currentIndex] = nextSection;
  else sections.unshift(nextSection);

  return {
    ...input.document,
    title: input.fields.title,
    slug: input.definition.route,
    sections,
    updatedAt: new Date().toISOString()
  };
}

export function findPolicyContentSection(document: CmsPageDocument, policyId: string) {
  return document.sections.find((section) => section.id === `policy.${policyId}`)
    ?? document.sections.find((section) => !section.hidden && String(section.type) === "editorialStory")
    ?? document.sections.find((section) => !section.hidden);
}

function createPolicyContentSection(
  definition: StorePolicyDefinition,
  fields: StorePolicyFields
): CmsSection {
  return createCmsSection("editorialStory", {
    id: `policy.${definition.id}`,
    label: definition.label,
    variant: "editorial-content",
    content: {
      eyebrow: "Policy",
      title: fields.title,
      body: fields.body,
      primaryCtaLabel: "",
      primaryCtaHref: "",
      items: []
    },
    layout: {
      columns: 1,
      containerWidth: "normal",
      imagePosition: "none",
      paddingTop: 64,
      paddingBottom: 64
    },
    advanced: {
      footerVisible: fields.footerVisible,
      effectiveAt: fields.effectiveAt
    }
  });
}
