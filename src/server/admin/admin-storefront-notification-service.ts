/** Builds the in-Admin Storefront activity feed from the immutable audit trail. */

import "server-only";

import type { Prisma } from "@prisma/client";
import type { AdminPermission } from "@/server/admin/identity";
import { getPrismaClient } from "@/server/db/prisma";

export const adminStorefrontNotificationLimit = 20;

export type AdminStorefrontNotificationCategory =
  | "business"
  | "homepage"
  | "locations"
  | "media"
  | "navigation"
  | "policies"
  | "promotions";

export type AdminStorefrontNotificationItem = Readonly<{
  id: string;
  category: AdminStorefrontNotificationCategory;
  title: string;
  summary: string;
  href: string;
  occurredAt: string;
  read: boolean;
}>;

export type AdminStorefrontNotificationFeed = Readonly<{
  available: true;
  items: readonly AdminStorefrontNotificationItem[];
  unreadCount: number;
  lastSeenAt: string | null;
}> | Readonly<{
  available: false;
  items: readonly [];
  unreadCount: 0;
  lastSeenAt: null;
  reason: AdminStorefrontNotificationUnavailableReason;
}>;

export type AdminStorefrontNotificationUnavailableReason =
  | "DATABASE_IDENTITY_REQUIRED"
  | "DATABASE_NOT_CONFIGURED"
  | "ADMIN_IDENTITY_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE";

type AuditRecord = Readonly<{
  id: string;
  action: string;
  entityType: string;
  createdAt: Date;
}>;

type NotificationRule = Readonly<{
  category: AdminStorefrontNotificationCategory;
  permission: AdminPermission;
  actions: readonly string[];
  entityTypes?: readonly string[];
  excludedEntityTypes?: readonly string[];
  entityTypePrefix?: string;
  title: string;
  summary: string;
  href: string;
}>;

type NotificationPrisma = ReturnType<typeof getPrismaClient>;

type ServiceDependencies = Readonly<{
  getClient?: () => NotificationPrisma;
  now?: () => Date;
}>;

const cmsChangeActions = [
  "CMS_DRAFT_SAVED",
  "CMS_PUBLISHED",
  "CMS_ROLLED_BACK",
  "CMS_UNPUBLISHED",
  "CMS_ARCHIVED"
] as const;

const notificationRules: readonly NotificationRule[] = [
  {
    category: "locations",
    permission: "store-settings:read",
    actions: ["STORE_LOCATION_CREATED", "STORE_LOCATION_UPDATED"],
    title: "Locations updated",
    summary: "Storefront location information changed.",
    href: "/admin/settings?area=locations"
  },
  {
    category: "policies",
    permission: "store-settings:read",
    actions: ["STORE_POLICY_DRAFT_SAVED", "STORE_POLICY_PUBLISHED"],
    title: "Legal & policies updated",
    summary: "A storefront policy was saved or published.",
    href: "/admin/settings?area=policies"
  },
  {
    category: "business",
    permission: "store-settings:read",
    actions: ["STORE_SETTINGS_DRAFT_SAVED", "STORE_SETTINGS_PUBLISHED"],
    title: "Business settings updated",
    summary: "Storefront business information changed.",
    href: "/admin/settings?area=business"
  },
  {
    category: "media",
    permission: "media:read",
    actions: ["MEDIA_ASSET_UPLOADED", "MEDIA_ASSET_METADATA_UPDATED"],
    title: "Media library updated",
    summary: "A storefront media asset changed.",
    href: "/admin/storefront-pages?tab=media"
  },
  {
    category: "navigation",
    permission: "storefront:read",
    actions: ["STOREFRONT_NAVIGATION_DRAFTED", "STOREFRONT_NAVIGATION_PUBLISHED"],
    title: "Navigation updated",
    summary: "Storefront navigation was saved or published.",
    href: "/admin/storefront-pages?tab=navigation"
  },
  {
    category: "homepage",
    permission: "storefront:read",
    actions: [
      "WEBSITE_MERCHANDISING_NO_SHIPPING_DRAFT_CREATED",
      "WEBSITE_MERCHANDISING_PUBLISHED",
      "WEBSITE_MERCHANDISING_ROLLED_BACK"
    ],
    title: "Homepage merchandising updated",
    summary: "Storefront merchandising changed.",
    href: "/admin/homepage"
  },
  {
    category: "promotions",
    permission: "promotions:read",
    actions: [
      "PROMOTION_CREATED",
      "PROMOTION_UPDATED",
      "PROMOTION_PUBLISHED",
      "PROMOTION_UNPUBLISHED",
      "PROMOTION_ARCHIVED"
    ],
    title: "Promotion updated",
    summary: "A storefront promotion changed.",
    href: "/admin/promotions"
  },
  {
    category: "promotions",
    permission: "promotions:read",
    actions: cmsChangeActions,
    entityTypes: ["CMS_holiday", "CMS_landing"],
    title: "Campaign content updated",
    summary: "Storefront campaign content changed.",
    href: "/admin/promotions"
  },
  {
    category: "policies",
    permission: "store-settings:read",
    actions: cmsChangeActions,
    entityTypes: ["CMS_policy", "CMS_location"],
    title: "Store settings content updated",
    summary: "Policy or location content changed.",
    href: "/admin/settings"
  },
  {
    category: "homepage",
    permission: "storefront:read",
    actions: cmsChangeActions,
    entityTypePrefix: "CMS_",
    excludedEntityTypes: ["CMS_holiday", "CMS_landing", "CMS_policy", "CMS_location"],
    title: "Storefront content updated",
    summary: "Website content was saved or published.",
    href: "/admin/homepage"
  }
];

export async function readAdminStorefrontNotifications(
  input: Readonly<{ adminUserId: string; capabilities: readonly string[] }>,
  dependencies: ServiceDependencies = {}
): Promise<AdminStorefrontNotificationFeed> {
  const unavailableReason = notificationStorageUnavailableReason();
  if (unavailableReason) return unavailableFeed(unavailableReason);

  const rules = accessibleNotificationRules(input.capabilities);

  try {
    const prisma = (dependencies.getClient ?? getPrismaClient)();
    const adminUser = await prisma.adminUser.findFirst({
      where: { id: input.adminUserId, status: "ACTIVE" },
      select: { notificationsLastSeenAt: true }
    });
    if (!adminUser) return unavailableFeed("ADMIN_IDENTITY_UNAVAILABLE");
    if (rules.length === 0) {
      return { available: true, items: [], unreadCount: 0, lastSeenAt: adminUser.notificationsLastSeenAt?.toISOString() ?? null };
    }

    const records = await prisma.auditLog.findMany({
      where: { OR: rules.map(ruleToPrismaWhere) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: adminStorefrontNotificationLimit,
      select: { id: true, action: true, entityType: true, createdAt: true }
    });
    const items = records.flatMap((record) => {
      const rule = rules.find((candidate) => ruleMatchesAudit(candidate, record));
      if (!rule) return [];
      return [toNotificationItem(record, rule, adminUser.notificationsLastSeenAt)];
    });

    return {
      available: true,
      items,
      unreadCount: items.filter((item) => !item.read).length,
      lastSeenAt: adminUser.notificationsLastSeenAt?.toISOString() ?? null
    };
  } catch {
    return unavailableFeed("DATABASE_UNAVAILABLE");
  }
}

export async function markAllAdminStorefrontNotificationsRead(
  input: Readonly<{ adminUserId: string }>,
  dependencies: ServiceDependencies = {}
) {
  const unavailableReason = notificationStorageUnavailableReason();
  if (unavailableReason) return { ok: false as const, reason: unavailableReason };

  try {
    const seenAt = (dependencies.now ?? (() => new Date()))();
    const result = await (dependencies.getClient ?? getPrismaClient)().adminUser.updateMany({
      where: { id: input.adminUserId, status: "ACTIVE" },
      data: { notificationsLastSeenAt: seenAt }
    });
    if (result.count !== 1) return { ok: false as const, reason: "ADMIN_IDENTITY_UNAVAILABLE" as const };
    return { ok: true as const, lastSeenAt: seenAt.toISOString() };
  } catch {
    return { ok: false as const, reason: "DATABASE_UNAVAILABLE" as const };
  }
}

export function accessibleNotificationRules(capabilities: readonly string[]) {
  const capabilitySet = new Set(capabilities);
  return notificationRules.filter((rule) => capabilitySet.has(rule.permission));
}

export function ruleMatchesAudit(rule: NotificationRule, record: Pick<AuditRecord, "action" | "entityType">) {
  if (!rule.actions.includes(record.action)) return false;
  if (rule.entityTypes && !rule.entityTypes.includes(record.entityType)) return false;
  if (rule.excludedEntityTypes?.includes(record.entityType)) return false;
  if (rule.entityTypePrefix && !record.entityType.startsWith(rule.entityTypePrefix)) return false;
  return true;
}

function ruleToPrismaWhere(rule: NotificationRule): Prisma.AuditLogWhereInput {
  return {
    action: { in: [...rule.actions] },
    ...(rule.entityTypes ? { entityType: { in: [...rule.entityTypes] } } : {}),
    ...(rule.entityTypePrefix ? { entityType: { startsWith: rule.entityTypePrefix } } : {}),
    ...(rule.excludedEntityTypes ? { NOT: { entityType: { in: [...rule.excludedEntityTypes] } } } : {})
  };
}

function toNotificationItem(record: AuditRecord, rule: NotificationRule, lastSeenAt: Date | null): AdminStorefrontNotificationItem {
  return {
    id: record.id,
    category: rule.category,
    title: rule.title,
    summary: rule.summary,
    href: rule.href,
    occurredAt: record.createdAt.toISOString(),
    read: Boolean(lastSeenAt && record.createdAt <= lastSeenAt)
  };
}

function notificationStorageUnavailableReason(): AdminStorefrontNotificationUnavailableReason | null {
  if (process.env.ADMIN_IDENTITY_MODE !== "DATABASE") return "DATABASE_IDENTITY_REQUIRED";
  if (!process.env.DATABASE_URL) return "DATABASE_NOT_CONFIGURED";
  return null;
}

function unavailableFeed(reason: AdminStorefrontNotificationUnavailableReason): AdminStorefrontNotificationFeed {
  return { available: false, items: [], unreadCount: 0, lastSeenAt: null, reason };
}
