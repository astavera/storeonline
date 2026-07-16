import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

loadEnvironment();

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");

const arguments_ = parseArguments(process.argv.slice(2));
const sources = [
  source("merchandising", "data/admin-merchandising.json"),
  source("cmsShop", "data/admin-cms/cms-landing-shop.json"),
  source("cmsHomepage", "data/admin-cms/homepage.json")
];
const importDigest = sha256(Buffer.from(sources.map((entry) => `${entry.name}:${entry.sha256}`).join("\n")));
const merchandising = JSON.parse(sources[0].content);
const cmsRows = [...JSON.parse(sources[1].content), ...JSON.parse(sources[2].content)];
validateContent(cmsRows, merchandising);

const summary = {
  importDigest,
  cmsVersions: cmsRows.length,
  merchandisingVersions: 1,
  merchandisingPlacements: merchandising.placements.length,
  sources: Object.fromEntries(sources.map((entry) => [entry.name, { path: entry.path, sha256: entry.sha256 }]))
};

if (!arguments_.apply) {
  console.log(JSON.stringify({ mode: "dry-run", canApply: true, ...summary }, null, 2));
  process.exit(0);
}
if (arguments_.confirmation !== importDigest) {
  fail(`Refusing import. Re-run with --confirm ${importDigest}`);
}

const prisma = new PrismaClient({ log: ["error"] });
try {
  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT 'locked'::text AS status FROM pg_advisory_xact_lock(hashtext('modern-state-legacy-content-import'))`;
    const existingMarker = await transaction.auditLog.findFirst({
      where: { action: "LEGACY_CONTENT_IMPORT_APPLIED", entityType: "LegacyImport", entityId: importDigest }
    });
    if (existingMarker) return { alreadyApplied: true };

    const keys = Array.from(new Set(cmsRows.map((row) => `${row.entityType}:${row.entityId}`)));
    keys.push("WEBSITE_MERCHANDISING:global");
    const existing = await transaction.cmsContentVersion.findMany({
      where: {
        OR: keys.map((key) => {
          const separator = key.indexOf(":");
          return { entityType: key.slice(0, separator), entityId: key.slice(separator + 1) };
        })
      },
      select: { entityType: true, entityId: true, versionNumber: true }
    });
    if (existing.length > 0) {
      throw new Error(`Import target is no longer empty (${existing.length} existing CMS versions). Reconcile again before merging.`);
    }

    await transaction.cmsContentVersion.createMany({
      data: cmsRows.map((row) => ({
        entityType: row.entityType,
        entityId: row.entityId,
        versionNumber: row.versionNumber,
        status: row.status,
        title: row.title ?? null,
        payload: row.payload,
        publishedAt: row.status === "PUBLISHED" ? new Date(row.publishedAt ?? row.createdAt) : null,
        scheduledPublishAt: row.scheduledPublishAt ? new Date(row.scheduledPublishAt) : null,
        scheduledUnpublishAt: row.scheduledUnpublishAt ? new Date(row.scheduledUnpublishAt) : null,
        createdAt: new Date(row.createdAt)
      }))
    });
    await transaction.cmsContentVersion.create({
      data: {
        entityType: "WEBSITE_MERCHANDISING",
        entityId: "global",
        versionNumber: 1,
        status: "DRAFT",
        title: "Imported website merchandising",
        payload: merchandising,
        createdAt: new Date(merchandising.updatedAt)
      }
    });
    await transaction.auditLog.create({
      data: {
        action: "LEGACY_CONTENT_IMPORT_APPLIED",
        entityType: "LegacyImport",
        entityId: importDigest,
        after: summary
      }
    });
    return { alreadyApplied: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
  console.log(JSON.stringify({ mode: "apply", ...result, ...summary }, null, 2));
} finally {
  await prisma.$disconnect();
}

function validateContent(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) fail("No CMS versions were found.");
  const statusValues = new Set(["DRAFT", "PREVIEW", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]);
  for (const row of rows) {
    if (!row.entityType || !row.entityId || !Number.isSafeInteger(row.versionNumber) || row.versionNumber < 1 || !statusValues.has(row.status)) {
      fail("A legacy CMS version has an invalid identity, version, or status.");
    }
    if (!row.payload || !row.createdAt || Number.isNaN(Date.parse(row.createdAt))) fail("A legacy CMS version has an invalid payload or timestamp.");
  }
  const uniqueVersions = new Set(rows.map((row) => `${row.entityType}:${row.entityId}:${row.versionNumber}`));
  if (uniqueVersions.size !== rows.length) fail("Legacy CMS versions contain duplicates.");
  if (config.version !== 3 || !Array.isArray(config.placements) || Number.isNaN(Date.parse(config.updatedAt))) {
    fail("Legacy merchandising does not satisfy the version 3 envelope.");
  }
}

function source(name, relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) fail(`Missing source: ${relativePath}`);
  const buffer = readFileSync(absolutePath);
  return { name, path: relativePath, content: buffer.toString("utf8"), sha256: sha256(buffer) };
}

function parseArguments(values) {
  let apply = false;
  let confirmation = "";
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--apply") apply = true;
    else if (values[index] === "--confirm") confirmation = values[++index] ?? "";
    else fail(`Unknown argument: ${values[index]}`);
  }
  return { apply, confirmation };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
