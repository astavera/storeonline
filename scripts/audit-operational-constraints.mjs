/**
 * Audits required database constraints and reports unsafe operational drift.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

loadEnvironment();
if (!process.env.DATABASE_URL) fail("DATABASE_URL is required for the read-only constraint audit.");

const checks = [
  ["Holiday", "Holiday_date_range_check", '"startDate" <= "endDate"'],
  ["ProductDepartmentAssignment", "ProductDepartmentAssignment_sort_order_check", '"sortOrder" >= 0'],
  ["ProductHolidayAssignment", "ProductHolidayAssignment_sort_order_check", '"sortOrder" >= 0'],
  ["WebsiteBrand", "WebsiteBrand_sort_order_check", '"sortOrder" >= 0'],
  ["ProductBrandAssignment", "ProductBrandAssignment_sort_order_check", '"sortOrder" >= 0'],
  ["ProductOverride", "ProductOverride_capacity_check", '("capacityPoints" IS NULL OR "capacityPoints" >= 0) AND ("prepTimeMinutes" IS NULL OR "prepTimeMinutes" >= 0)'],
  ["ProductOverride", "ProductOverride_schedule_range_check", '"scheduledPublishAt" IS NULL OR "scheduledUnpublishAt" IS NULL OR "scheduledPublishAt" <= "scheduledUnpublishAt"'],
  ["ProductOverride", "ProductOverride_visibility_status_check", 'NOT "webVisible" OR "webStatus" = \'PUBLISHED\''],
  ["WebsiteProductPlacement", "WebsiteProductPlacement_date_range_check", '"startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" <= "endsAt"'],
  ["WebsiteProductPlacement", "WebsiteProductPlacement_sort_order_check", '"sortOrder" >= 0'],
  ["CmsContentVersion", "CmsContentVersion_version_check", '"versionNumber" > 0'],
  ["CmsContentVersion", "CmsContentVersion_schedule_range_check", '"scheduledPublishAt" IS NULL OR "scheduledUnpublishAt" IS NULL OR "scheduledPublishAt" <= "scheduledUnpublishAt"'],
  ["CmsContentVersion", "CmsContentVersion_published_state_check", '"status" <> \'PUBLISHED\' OR "publishedAt" IS NOT NULL'],
  ["MediaAsset", "MediaAsset_dimensions_check", '("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)'],
  ["CartItem", "CartItem_quantity_check", '"quantity" > 0'],
  ["OrderItemMirror", "OrderItemMirror_quantity_check", '"quantity" > 0'],
  ["FulfillmentTask", "FulfillmentTask_capacity_check", '"capacityPoints" > 0'],
  ["FulfillmentTask", "FulfillmentTask_address_mode_check", '("mode" <> \'LOCAL_DELIVERY\' OR "deliveryAddress" IS NOT NULL) AND ("mode" <> \'SHIPPING\' OR "shippingAddress" IS NOT NULL)'],
  ["DeliveryZone", "DeliveryZone_nonnegative_values_check", '"version" > 0 AND "baseFeeCents" >= 0 AND "minimumOrderCents" >= 0 AND ("maxDistanceMiles" IS NULL OR "maxDistanceMiles" >= 0) AND ("maxRouteMinutes" IS NULL OR "maxRouteMinutes" >= 0) AND "cutoffMinutes" >= 0 AND "leadTimeMinutes" >= 0'],
  ["SlotTemplate", "SlotTemplate_values_check", '"dayOfWeek" BETWEEN 0 AND 6 AND "capacityPoints" > 0 AND "cutoffMinutes" >= 0 AND "leadTimeMinutes" >= 0 AND "startTime" ~ \'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$\' AND "endTime" ~ \'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$\' AND "startTime" < "endTime"'],
  ["SlotHold", "SlotHold_values_check", '"capacityPoints" > 0 AND "expiresAt" > "createdAt" AND NOT ("confirmedAt" IS NOT NULL AND "releasedAt" IS NOT NULL) AND ("confirmedAt" IS NULL OR "confirmedAt" >= "createdAt") AND ("releasedAt" IS NULL OR "releasedAt" >= "createdAt")'],
  ["ShippingRateQuote", "ShippingRateQuote_values_check", '"amountCents" >= 0 AND "expiresAt" > "createdAt"'],
  ["WebhookInboxEvent", "WebhookInboxEvent_processing_lease_check", '("status" = \'PROCESSING\' AND "lockedAt" IS NOT NULL AND "lockToken" IS NOT NULL AND "lastAttemptAt" IS NOT NULL) OR ("status" <> \'PROCESSING\' AND "lockedAt" IS NULL AND "lockToken" IS NULL)'],
  ["WebhookInboxEvent", "WebhookInboxEvent_retry_schedule_check", '("status" = \'FAILED\' AND "nextAttemptAt" IS NOT NULL) OR ("status" <> \'FAILED\' AND "nextAttemptAt" IS NULL)']
];

const prisma = new PrismaClient({ log: ["error"] });
try {
  const states = await prisma.$queryRaw`
    SELECT conname AS name, convalidated AS validated
    FROM pg_constraint
    WHERE conname = ANY(${checks.map(([, name]) => name)}::text[])
  `;
  const stateByName = new Map(states.map((state) => [state.name, state.validated]));
  const results = [];
  for (const [table, constraint, condition] of checks) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE (${condition}) IS FALSE`);
    results.push({ table, constraint, present: stateByName.has(constraint), validated: stateByName.get(constraint) ?? false, violations: rows[0]?.count ?? 0 });
  }
  const violations = results.reduce((sum, check) => sum + check.violations, 0);
  const missing = results.filter((check) => !check.present).length;
  console.log(JSON.stringify({ mode: "read-only", violations, missingConstraints: missing, checks: results }, null, 2));
  if (violations > 0 || missing > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

function loadEnvironment() {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
