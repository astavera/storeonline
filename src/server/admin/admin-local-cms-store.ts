import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type LocalCmsStatus = "DRAFT" | "PREVIEW" | "PUBLISHED" | "SCHEDULED" | "UNPUBLISHED";

export type LocalCmsVersion = {
  entityType: "ADMIN_MODULE";
  entityId: string;
  versionNumber: number;
  status: LocalCmsStatus;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
  publishedAt: string | null;
};

const localCmsDir = path.join(process.cwd(), "data", "admin-cms");

export async function readLocalCmsVersions(entityId: string) {
  try {
    const raw = await readFile(localCmsPath(entityId), "utf8");
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isLocalCmsVersion) : [];
  } catch {
    return [];
  }
}

export async function writeLocalCmsVersion(input: {
  entityType: "ADMIN_MODULE";
  entityId: string;
  status: LocalCmsStatus;
  title: string;
  payload: Record<string, unknown>;
}) {
  const existing = await readLocalCmsVersions(input.entityId);
  const nextVersionNumber = existing.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  const now = new Date().toISOString();
  const nextVersion: LocalCmsVersion = {
    ...input,
    versionNumber: nextVersionNumber,
    createdAt: now,
    publishedAt: input.status === "PUBLISHED" ? now : null
  };

  await mkdir(localCmsDir, { recursive: true });
  await writeFile(localCmsPath(input.entityId), JSON.stringify([...existing, nextVersion], null, 2));

  return nextVersion;
}

function localCmsPath(entityId: string) {
  return path.join(localCmsDir, `${entityId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`);
}

function isLocalCmsVersion(value: unknown): value is LocalCmsVersion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const version = value as Partial<LocalCmsVersion>;

  return (
    version.entityType === "ADMIN_MODULE" &&
    typeof version.entityId === "string" &&
    typeof version.versionNumber === "number" &&
    typeof version.status === "string" &&
    typeof version.title === "string" &&
    Boolean(version.payload) &&
    typeof version.payload === "object"
  );
}
