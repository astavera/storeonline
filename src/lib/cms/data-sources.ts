/**
 * Provides shared data sources types and utilities for the application.
 */

import { cmsDataSourceTypes, type CmsDataSourceType, type SectionDataSource } from "./cms-types";

export { cmsDataSourceTypes, type CmsDataSourceType };

export const manualDataSource: SectionDataSource = {
  type: "manual"
};

export const commerceDataSourceTypes: CmsDataSourceType[] = ["productCollection", "department", "holiday", "squareCatalog", "productPlacement", "relatedProducts", "latestProducts", "featuredProducts", "recentlyViewed"];

export const contentDataSourceTypes: CmsDataSourceType[] = ["manual", "locationData", "blogPosts", "policyContent", "custom"];

export function createSectionDataSource(type: CmsDataSourceType = "manual", overrides: Partial<SectionDataSource> = {}): SectionDataSource {
  return {
    type,
    ...overrides
  };
}

export function isCommerceDataSource(dataSource: SectionDataSource) {
  return commerceDataSourceTypes.includes(dataSource.type);
}
