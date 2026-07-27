import { Prisma, PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const batchSize = readBatchSize();
const databaseUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required.");
}

process.env.DATABASE_URL = databaseUrl;
const prisma = new PrismaClient();

type DatabaseIdentity = {
  databaseName: string;
  serverAddress: string | null;
  serverPort: number;
};

type RelationSummary = {
  relationName: string;
  estimatedRows: bigint;
  estimatedDeadRows: bigint;
  totalBytes: bigint;
  estimatedRawBytes: bigint;
};

try {
  const identity = await readDatabaseIdentity();
  const before = await readRelationSummaries();

  printIdentity(identity);
  printSummaries("before", before);

  if (!apply) {
    console.log("DRY_RUN_ONLY: rerun with --apply on the private VPS copy.");
    console.log(`Required confirmation: SQUARE_COMPACTION_CONFIRM_DATABASE=${identity.databaseName}`);
    process.exitCode = 0;
  } else {
    requireDatabaseConfirmation(identity.databaseName);
    const catalogUpdated = await compactCatalogObjects();
    const variationsUpdated = await compactVariations();
    await prisma.$executeRaw`ANALYZE "SquareCatalogObject"`;
    await prisma.$executeRaw`ANALYZE "SquareItemVariation"`;

    const after = await readRelationSummaries();
    console.log(`UPDATED SquareCatalogObject=${catalogUpdated}`);
    console.log(`UPDATED SquareItemVariation=${variationsUpdated}`);
    printSummaries("after", after);
    console.log("COMPACTION_COMPLETE");
    console.log("Next maintenance window step: VACUUM (FULL, ANALYZE) the two compacted tables to return disk space.");
  }
} finally {
  await prisma.$disconnect();
}

async function readDatabaseIdentity(): Promise<DatabaseIdentity> {
  const [identity] = await prisma.$queryRaw<Array<{
    databaseName: string;
    serverAddress: string | null;
    serverPort: number;
  }>>(Prisma.sql`
    SELECT
      current_database() AS "databaseName",
      inet_server_addr()::text AS "serverAddress",
      inet_server_port() AS "serverPort"
  `);
  if (!identity) throw new Error("Unable to identify the PostgreSQL database.");
  return identity;
}

async function readRelationSummaries(): Promise<RelationSummary[]> {
  return prisma.$queryRaw<Array<RelationSummary>>(Prisma.sql`
    SELECT
      stats.relname AS "relationName",
      stats.n_live_tup::bigint AS "estimatedRows",
      stats.n_dead_tup::bigint AS "estimatedDeadRows",
      pg_total_relation_size(stats.relid)::bigint AS "totalBytes",
      COALESCE(raw_stats.avg_width::bigint * stats.n_live_tup::bigint, 0)::bigint AS "estimatedRawBytes"
    FROM pg_stat_user_tables stats
    LEFT JOIN pg_stats raw_stats
      ON raw_stats.schemaname = stats.schemaname
      AND raw_stats.tablename = stats.relname
      AND raw_stats.attname = 'raw'
    WHERE stats.relname IN ('SquareCatalogObject', 'SquareItemVariation')
    ORDER BY stats.relname
  `);
}

async function compactCatalogObjects() {
  let cursor = "";
  let updated = 0;

  while (true) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "SquareCatalogObject"
      WHERE "id" > ${cursor}
      ORDER BY "id"
      LIMIT ${batchSize}
    `);
    if (rows.length === 0) return updated;

    const lastId = rows.at(-1)?.id;
    if (!lastId) return updated;
    updated += await prisma.$executeRaw(Prisma.sql`
      WITH compacted AS (
        SELECT
          "id",
          CASE
            WHEN "deletedAt" IS NOT NULL THEN '{}'::jsonb
            WHEN "type" = 'ITEM' THEN jsonb_strip_nulls(jsonb_build_object(
              'imageId', "raw" -> 'imageId',
              'itemData', jsonb_strip_nulls(jsonb_build_object(
                'imageIds', "raw" #> '{itemData,imageIds}'
              ))
            ))
            WHEN "type" = 'IMAGE' THEN jsonb_strip_nulls(jsonb_build_object(
              'imageData', jsonb_strip_nulls(jsonb_build_object(
                'url', "raw" #> '{imageData,url}'
              ))
            ))
            WHEN "type" = 'CATEGORY' THEN jsonb_strip_nulls(jsonb_build_object(
              'categoryData', jsonb_strip_nulls(jsonb_build_object(
                'name', "raw" #> '{categoryData,name}'
              ))
            ))
            ELSE '{}'::jsonb
          END AS compact_raw
        FROM "SquareCatalogObject"
        WHERE "id" > ${cursor} AND "id" <= ${lastId}
      )
      UPDATE "SquareCatalogObject" target
      SET "raw" = compacted.compact_raw
      FROM compacted
      WHERE target."id" = compacted."id"
        AND target."raw" IS DISTINCT FROM compacted.compact_raw
    `);
    cursor = lastId;
    console.log(`PROGRESS SquareCatalogObject cursor=${cursor} updated=${updated}`);
  }
}

async function compactVariations() {
  let cursor = "";
  let updated = 0;

  while (true) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "SquareItemVariation"
      WHERE "id" > ${cursor}
      ORDER BY "id"
      LIMIT ${batchSize}
    `);
    if (rows.length === 0) return updated;

    const lastId = rows.at(-1)?.id;
    if (!lastId) return updated;
    updated += await prisma.$executeRaw(Prisma.sql`
      WITH compacted AS (
        SELECT
          "id",
          CASE
            WHEN "deletedAt" IS NOT NULL THEN '{}'::jsonb
            ELSE jsonb_strip_nulls(jsonb_build_object(
              'imageId', "raw" -> 'imageId',
              'itemVariationData', jsonb_strip_nulls(jsonb_build_object(
                'imageIds', "raw" #> '{itemVariationData,imageIds}',
                'trackInventory', "raw" #> '{itemVariationData,trackInventory}'
              ))
            ))
          END AS compact_raw
        FROM "SquareItemVariation"
        WHERE "id" > ${cursor} AND "id" <= ${lastId}
      )
      UPDATE "SquareItemVariation" target
      SET "raw" = compacted.compact_raw
      FROM compacted
      WHERE target."id" = compacted."id"
        AND target."raw" IS DISTINCT FROM compacted.compact_raw
    `);
    cursor = lastId;
    console.log(`PROGRESS SquareItemVariation cursor=${cursor} updated=${updated}`);
  }
}

function requireDatabaseConfirmation(databaseName: string) {
  const confirmation = process.env.SQUARE_COMPACTION_CONFIRM_DATABASE?.trim();
  if (confirmation !== databaseName) {
    throw new Error(
      `Refusing to compact ${databaseName}. Set SQUARE_COMPACTION_CONFIRM_DATABASE=${databaseName} after verifying this is the private VPS copy.`
    );
  }
}

function readBatchSize() {
  const argument = process.argv.find((value) => value.startsWith("--batch-size="));
  const parsed = Number(argument?.slice("--batch-size=".length) ?? "5000");
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 25_000) {
    throw new Error("--batch-size must be an integer between 100 and 25000.");
  }
  return parsed;
}

function printIdentity(identity: DatabaseIdentity) {
  console.log(`DATABASE name=${identity.databaseName} address=${identity.serverAddress ?? "local-socket"} port=${identity.serverPort}`);
}

function printSummaries(stage: string, summaries: RelationSummary[]) {
  for (const summary of summaries) {
    console.log([
      `SUMMARY stage=${stage}`,
      `table=${summary.relationName}`,
      `estimated_rows=${summary.estimatedRows}`,
      `estimated_dead_rows=${summary.estimatedDeadRows}`,
      `estimated_raw_bytes=${summary.estimatedRawBytes}`,
      `total_bytes=${summary.totalBytes}`
    ].join(" "));
  }
}
