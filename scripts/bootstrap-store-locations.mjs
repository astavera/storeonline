import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const confirmation = "modern-state-store-locations-v1";
const locations = [
  {
    id: "store-3rd-avenue",
    slug: "3rd-avenue",
    name: "3rd Avenue Store",
    address: "1243 3rd Ave., New York, NY 10021",
    phone: "212-879-8076",
    pickupEnabled: true,
    localDeliveryEnabled: true,
    shippingFulfillmentEnabled: false
  },
  {
    id: "store-86th-street",
    slug: "86th-street",
    name: "86th Street Store",
    address: "112 East 86th Street, New York, NY 10028",
    phone: "212-831-8010",
    pickupEnabled: true,
    localDeliveryEnabled: true,
    shippingFulfillmentEnabled: false
  }
];

loadEnvironment();
if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");
const arguments_ = parseArguments(process.argv.slice(2));
if (!arguments_.apply) {
  console.log(JSON.stringify({ mode: "dry-run", confirmation, locations }, null, 2));
  process.exit(0);
}
if (arguments_.confirmation !== confirmation) fail(`Refusing bootstrap. Re-run with --confirm ${confirmation}`);

const prisma = new PrismaClient({ log: ["error"] });
try {
  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT 'locked'::text AS status FROM pg_advisory_xact_lock(hashtext('modern-state-location-bootstrap'))`;
    const existing = await transaction.storeLocation.findMany({
      where: { OR: [{ id: { in: locations.map((location) => location.id) } }, { slug: { in: locations.map((location) => location.slug) } }] }
    });
    for (const current of existing) {
      const expected = locations.find((location) => location.id === current.id && location.slug === current.slug);
      if (!expected || !sameLocation(current, expected)) {
        throw new Error(`Location ${current.id}/${current.slug} conflicts with the reviewed bootstrap. Resolve it manually.`);
      }
    }
    const existingIds = new Set(existing.map((location) => location.id));
    const missing = locations.filter((location) => !existingIds.has(location.id));
    if (missing.length > 0) await transaction.storeLocation.createMany({ data: missing });
    if (missing.length > 0) {
      await transaction.auditLog.create({
        data: {
          action: "STORE_LOCATIONS_BOOTSTRAPPED",
          entityType: "StoreLocation",
          entityId: confirmation,
          after: { createdIds: missing.map((location) => location.id) }
        }
      });
    }
    return { created: missing.length, unchanged: existing.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  console.log(JSON.stringify({ mode: "apply", ...result, confirmation }, null, 2));
} finally {
  await prisma.$disconnect();
}

function sameLocation(current, expected) {
  return ["name", "address", "phone", "pickupEnabled", "localDeliveryEnabled", "shippingFulfillmentEnabled"]
    .every((key) => current[key] === expected[key]);
}

function parseArguments(values) {
  let apply = false;
  let received = "";
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--apply") apply = true;
    else if (values[index] === "--confirm") received = values[++index] ?? "";
    else fail(`Unknown argument: ${values[index]}`);
  }
  return { apply, confirmation: received };
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
