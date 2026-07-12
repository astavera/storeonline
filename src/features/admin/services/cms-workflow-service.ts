export type CmsWorkflowStatus = "DRAFT" | "PREVIEW" | "SCHEDULED" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";

export type CmsVersion = {
  versionNumber: number;
  status: CmsWorkflowStatus;
  payload: Record<string, unknown>;
  scheduledPublishAt?: string | null;
  scheduledUnpublishAt?: string | null;
};

export function canPublishCmsVersion(version: CmsVersion) {
  return version.status === "DRAFT" || version.status === "PREVIEW" || version.status === "SCHEDULED" || version.status === "UNPUBLISHED";
}

export function createRollbackVersion(currentVersions: CmsVersion[], targetVersion: CmsVersion): CmsVersion {
  const nextVersionNumber = Math.max(0, ...currentVersions.map((version) => version.versionNumber)) + 1;

  return {
    versionNumber: nextVersionNumber,
    status: "DRAFT",
    payload: targetVersion.payload,
    scheduledPublishAt: null,
    scheduledUnpublishAt: null
  };
}
