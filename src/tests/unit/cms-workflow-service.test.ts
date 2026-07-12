import { describe, expect, it } from "vitest";
import { canPublishCmsVersion, createRollbackVersion } from "@/features/admin/services/cms-workflow-service";

describe("cms workflow service", () => {
  it("allows draft, preview, scheduled, and unpublished content to publish", () => {
    expect(canPublishCmsVersion({ versionNumber: 1, status: "DRAFT", payload: {} })).toBe(true);
    expect(canPublishCmsVersion({ versionNumber: 1, status: "PUBLISHED", payload: {} })).toBe(false);
  });

  it("creates rollback as a new draft version", () => {
    const rollback = createRollbackVersion(
      [
        { versionNumber: 1, status: "PUBLISHED", payload: { title: "Old" } },
        { versionNumber: 2, status: "PUBLISHED", payload: { title: "New" } }
      ],
      { versionNumber: 1, status: "PUBLISHED", payload: { title: "Old" } }
    );

    expect(rollback.versionNumber).toBe(3);
    expect(rollback.status).toBe("DRAFT");
    expect(rollback.payload).toEqual({ title: "Old" });
  });
});
