export type SquareCatalogCacheSummary = {
  available: boolean;
  environment: "sandbox" | "production" | null;
  status: "running" | "partial" | "failed" | "completed" | "unavailable";
  hasMore: boolean;
  pagesCompleted: number;
  itemCount: number;
  variationCount: number;
  imageCount: number;
  categoryCount: number;
  vendorCount: number;
  updatedAt: string | null;
};

export type SquareCatalogCacheProduct = {
  id: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  variationCount: number;
  imageUrl: string | null;
  categoryNames: string[];
  firstVariation: {
    id: string;
    name: string;
    sku: string | null;
    upc: string | null;
    priceAmount: string | null;
    currency: string | null;
    trackInventory: boolean;
  } | null;
};

export type SquareCatalogCategorySummary = {
  id: string;
  name: string;
  path: string;
  parentCategoryId: string | null;
  itemCount: number;
  variationCount: number;
};

export type SquareCatalogCachePage = {
  summary: SquareCatalogCacheSummary;
  products: SquareCatalogCacheProduct[];
  query: string;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};
