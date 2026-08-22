/** Database index and safe metadata mutations for Admin-managed storefront media. */

import "server-only";

import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { getPrismaClient } from "@/server/db/prisma";

export async function readAdminMediaLibrary(input: { q?: string; page?: number; pageSize?: number }) {
  const pageSize = [12, 24, 48].includes(input.pageSize ?? 24) ? input.pageSize ?? 24 : 24;
  const requestedPage = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  if (!process.env.DATABASE_URL) return emptyLibrary(requestedPage, pageSize);

  const q = input.q?.trim().slice(0, 100) ?? "";
  try {
    const prisma = getPrismaClient();
    const where = q ? { OR: [{ altTextEn: { contains: q, mode: "insensitive" as const } }, { sourceId: { contains: q, mode: "insensitive" as const } }] } : {};
    const total = await prisma.mediaAsset.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const assets = await prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, source: true, sourceId: true, url: true, altTextEn: true, mimeType: true, width: true, height: true, hiddenFromWebsite: true, createdAt: true }
    });
    return { available: true, total, page, pageCount, pageSize, assets: assets.map((asset) => ({ ...asset, createdAt: asset.createdAt.toISOString() })) };
  } catch (error) {
    console.warn("[admin-media] Could not read the media index.", error);
    return emptyLibrary(requestedPage, pageSize);
  }
}

export async function recordAdminMediaAsset(input: { fileName: string; url: string; mimeType: string; actorSubject: string }) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const asset = await getPrismaClient().mediaAsset.create({
      data: { source: "ADMIN_UPLOAD", sourceId: input.fileName, url: input.url, mimeType: input.mimeType }
    });
    await recordAdminAuditEvent({ actorId: input.actorSubject, action: "MEDIA_ASSET_UPLOADED", entityType: "MediaAsset", entityId: asset.id, after: { source: asset.source, sourceId: asset.sourceId, mimeType: asset.mimeType } });
    return asset.id;
  } catch (error) {
    console.warn("[admin-media] Upload succeeded but could not be indexed.", error);
    return null;
  }
}

export async function updateAdminMediaAsset(input: { id: string; altTextEn: string; hiddenFromWebsite: boolean; actorSubject: string }) {
  const altTextEn = input.altTextEn.trim().slice(0, 300) || null;
  const prisma = getPrismaClient();
  const before = await prisma.mediaAsset.findUnique({ where: { id: input.id }, select: { altTextEn: true, hiddenFromWebsite: true } });
  if (!before) return null;
  const asset = await prisma.mediaAsset.update({ where: { id: input.id }, data: { altTextEn, hiddenFromWebsite: input.hiddenFromWebsite }, select: { id: true, altTextEn: true, hiddenFromWebsite: true } });
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "MEDIA_ASSET_METADATA_UPDATED", entityType: "MediaAsset", entityId: asset.id, before, after: { altTextEn: asset.altTextEn, hiddenFromWebsite: asset.hiddenFromWebsite } });
  return asset;
}

function emptyLibrary(page: number, pageSize: number) {
  return { available: false, total: 0, page, pageCount: 1, pageSize, assets: [] as Array<{ id: string; source: string; sourceId: string | null; url: string; altTextEn: string | null; mimeType: string | null; width: number | null; height: number | null; hiddenFromWebsite: boolean; createdAt: string }> };
}
