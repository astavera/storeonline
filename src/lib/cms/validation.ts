/**
 * Provides shared validation types and utilities for the application.
 */

import { z } from "zod";
import { cmsDataSourceTypes, cmsEntityTypes, cmsVersionStatuses, type CmsPageDocument, type CmsSection } from "./cms-types";

const visibilitySchema = z.object({
  desktop: z.boolean(),
  tablet: z.boolean(),
  mobile: z.boolean()
});

const dataSourceSchema = z.object({
  type: z.enum(cmsDataSourceTypes),
  id: z.string().optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().positive().optional(),
  sort: z.string().optional(),
  manualIds: z.array(z.string()).optional()
});

const stringRecordSchema = z.record(z.string(), z.unknown());

export const seoConfigSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  canonicalUrl: z.string().optional(),
  indexable: z.boolean()
});

export const cmsSectionSchema: z.ZodType<CmsSection> = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  variant: z.string().trim().min(1),
  label: z.string().trim().min(1),
  hidden: z.boolean(),
  locked: z.boolean(),
  content: stringRecordSchema,
  design: stringRecordSchema,
  layout: stringRecordSchema,
  media: stringRecordSchema,
  dataSource: dataSourceSchema,
  visibility: visibilitySchema,
  advanced: stringRecordSchema
});

export const cmsPageDocumentSchema: z.ZodType<CmsPageDocument> = z.object({
  id: z.string().trim().min(1),
  entityType: z.enum(cmsEntityTypes),
  entityId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  seo: seoConfigSchema,
  themeOverrides: z.record(z.string(), z.unknown()).optional(),
  sections: z.array(cmsSectionSchema),
  status: z.enum(cmsVersionStatuses),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional()
});

export function validateCmsPageDocument(value: unknown) {
  const result = cmsPageDocumentSchema.safeParse(value);

  if (result.success) {
    return {
      ok: true as const,
      document: result.data,
      errors: []
    };
  }

  return {
    ok: false as const,
    document: null,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)
  };
}

export function validateCmsSection(value: unknown) {
  const result = cmsSectionSchema.safeParse(value);

  if (result.success) {
    return {
      ok: true as const,
      section: result.data,
      errors: []
    };
  }

  return {
    ok: false as const,
    section: null,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "section"}: ${issue.message}`)
  };
}
