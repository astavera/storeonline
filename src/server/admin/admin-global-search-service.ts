/** Federates bounded Admin search across real mirrors without crossing permission boundaries. */

import "server-only";

import { cmsEntityTypeToScope, cmsEntityTypes, type CmsEntityType } from "@/lib/cms";
import { getPrismaClient } from "@/server/db/prisma";

export const adminGlobalSearchDomains = ["catalog", "orders", "customers", "cms"] as const;

export type AdminGlobalSearchDomain = (typeof adminGlobalSearchDomains)[number];

export type AdminGlobalSearchResult = {
  id: string;
  domain: AdminGlobalSearchDomain;
  label: string;
  subtitle: string;
  href: string;
};

export type AdminGlobalSearchResponse = {
  query: string;
  results: AdminGlobalSearchResult[];
  accessibleDomains: AdminGlobalSearchDomain[];
  unavailableDomains: AdminGlobalSearchDomain[];
};

export type AdminGlobalSearchQueryResult =
  | { ok: true; query: string }
  | { ok: false; code: "QUERY_TOO_SHORT" | "QUERY_TOO_LONG"; message: string };

type AdminGlobalSearchInput = {
  query: string;
  capabilities: readonly string[];
};

const maximumResultsPerDomain = 8;

const permissionByDomain = {
  catalog: "catalog:read",
  orders: "orders:read",
  customers: "customers:read",
  cms: "storefront:read"
} as const satisfies Record<AdminGlobalSearchDomain, string>;

export function parseAdminGlobalSearchQuery(value: string | null | undefined): AdminGlobalSearchQueryResult {
  const query = value?.trim() ?? "";
  if (query.length < 2) {
    return { ok: false, code: "QUERY_TOO_SHORT", message: "Enter at least 2 characters." };
  }
  if (query.length > 100) {
    return { ok: false, code: "QUERY_TOO_LONG", message: "Search is limited to 100 characters." };
  }
  return { ok: true, query };
}

export async function searchAdminGlobal(input: AdminGlobalSearchInput): Promise<AdminGlobalSearchResponse> {
  const accessibleDomains = adminGlobalSearchDomains.filter((domain) => hasDomainPermission(input.capabilities, domain));
  const searches = accessibleDomains.map(async (domain) => {
    try {
      return { domain, results: await searchDomain(domain, input.query), available: true as const };
    } catch {
      return { domain, results: [] as AdminGlobalSearchResult[], available: false as const };
    }
  });
  const domainResults = await Promise.all(searches);

  return {
    query: input.query,
    results: domainResults.flatMap((result) => result.results.slice(0, maximumResultsPerDomain)),
    accessibleDomains,
    unavailableDomains: domainResults.filter((result) => !result.available).map((result) => result.domain)
  };
}

function hasDomainPermission(capabilities: readonly string[], domain: AdminGlobalSearchDomain) {
  return capabilities.includes("admin:*") || capabilities.includes(permissionByDomain[domain]);
}

async function searchDomain(domain: AdminGlobalSearchDomain, query: string): Promise<AdminGlobalSearchResult[]> {
  if (domain === "catalog") return searchCatalog(query);
  if (domain === "orders") return searchOrders(query);
  if (domain === "customers") return searchCustomers(query);
  return searchCmsPages(query);
}

async function searchCatalog(query: string): Promise<AdminGlobalSearchResult[]> {
  const records = await getPrismaClient().squareItemVariation.findMany({
    where: {
      deletedAt: null,
      item: { deletedAt: null, type: "ITEM" },
      OR: [
        { id: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { upc: { contains: query, mode: "insensitive" } },
        { item: { name: { contains: query, mode: "insensitive" } } }
      ]
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: maximumResultsPerDomain,
    select: {
      id: true,
      name: true,
      sku: true,
      upc: true,
      item: { select: { name: true } }
    }
  });

  return records.map((record) => {
    const itemName = record.item.name?.trim() || "Unnamed product";
    const variationName = record.name.trim();
    const identifiers = [record.sku ? `SKU ${record.sku}` : "", record.upc ? `UPC ${record.upc}` : ""].filter(Boolean);
    return {
      id: `catalog:${record.id}`,
      domain: "catalog",
      label: variationName && variationName.toLowerCase() !== itemName.toLowerCase()
        ? `${itemName} — ${variationName}`
        : itemName,
      subtitle: identifiers.join(" · ") || "Square catalog variation",
      href: `/admin/products/${encodeURIComponent(record.id)}`
    };
  });
}

async function searchOrders(query: string): Promise<AdminGlobalSearchResult[]> {
  const records = await getPrismaClient().orderMirror.findMany({
    where: {
      OR: [
        { id: { contains: query, mode: "insensitive" } },
        { squareOrderId: { contains: query, mode: "insensitive" } },
        { squarePaymentId: { contains: query, mode: "insensitive" } },
        { customerEmail: { contains: query, mode: "insensitive" } },
        { customerPhone: { contains: query, mode: "insensitive" } }
      ]
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: maximumResultsPerDomain,
    select: {
      id: true,
      squareOrderId: true,
      customerEmail: true,
      customerPhone: true,
      status: true,
      createdAt: true,
      _count: { select: { items: true } }
    }
  });

  return records.map((record) => {
    const reference = record.squareOrderId || record.id;
    const customer = record.customerEmail || record.customerPhone || "No customer contact";
    return {
      id: `orders:${record.id}`,
      domain: "orders",
      label: `Order ${reference}`,
      subtitle: `${record.status} · ${customer} · ${formatItemCount(record._count.items)}`,
      href: `/admin/orders?orderId=${encodeURIComponent(record.id)}`
    };
  });
}

async function searchCustomers(query: string): Promise<AdminGlobalSearchResult[]> {
  const records = await getPrismaClient().customerAccount.findMany({
    where: {
      OR: [
        { id: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { squareCustomerId: { contains: query, mode: "insensitive" } }
      ]
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: maximumResultsPerDomain,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      squareCustomerId: true
    }
  });

  return records.map((record) => {
    const name = [record.firstName, record.lastName].filter(Boolean).join(" ").trim();
    return {
      id: `customers:${record.id}`,
      domain: "customers",
      label: name || record.email,
      subtitle: record.squareCustomerId ? `${record.email} · Square customer` : record.email,
      href: `/admin/customers?customerId=${encodeURIComponent(record.id)}`
    };
  });
}

async function searchCmsPages(query: string): Promise<AdminGlobalSearchResult[]> {
  const records = await getPrismaClient().cmsContentVersion.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { entityId: { contains: query, mode: "insensitive" } },
        { entityType: { contains: query, mode: "insensitive" } }
      ]
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: maximumResultsPerDomain * 5,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      versionNumber: true,
      status: true,
      title: true
    }
  });
  const latestByPage = new Map<string, (typeof records)[number]>();

  for (const record of records) {
    const key = `${record.entityType}:${record.entityId}`;
    if (!latestByPage.has(key)) latestByPage.set(key, record);
    if (latestByPage.size >= maximumResultsPerDomain) break;
  }

  return Array.from(latestByPage.values()).map((record) => ({
    id: `cms:${record.entityType}:${record.entityId}`,
    domain: "cms",
    label: record.title?.trim() || record.entityId,
    subtitle: `${displayCmsEntityType(record.entityType)} · ${record.status.toLowerCase()} · version ${record.versionNumber}`,
    href: cmsAdminHref(record.entityType, record.entityId)
  }));
}

function cmsAdminHref(storedEntityType: string, entityId: string) {
  const entityType = storedEntityType.replace(/^CMS_/, "");
  if (entityType === "policy") {
    return `/admin/settings?area=policies&policy=${encodeURIComponent(entityId)}`;
  }
  if (entityType === "homepage") return "/admin/homepage";
  if ((cmsEntityTypes as readonly string[]).includes(entityType)) {
    const scope = cmsEntityTypeToScope(entityType as CmsEntityType);
    return `/admin/homepage?scope=${encodeURIComponent(scope)}&id=${encodeURIComponent(entityId)}`;
  }
  return "/admin/homepage";
}

function displayCmsEntityType(value: string) {
  return value.replace(/^CMS_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
}

function formatItemCount(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

