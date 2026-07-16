import { describe, expect, it, vi } from "vitest";
import type { CatalogObject } from "square";
import {
  requireReadOnlySquareSyncAllowed,
  SquareProductionSyncDisabledError,
  synchronizeSquareCatalogChanges,
  type SquareCatalogSyncStore
} from "@/server/square/catalog-postgres-sync";

function store(overrides: Partial<SquareCatalogSyncStore> = {}): SquareCatalogSyncStore {
  return {
    acquire: vi.fn().mockResolvedValue({ lockToken: "lease", latestTime: "2026-07-15T10:00:00Z" }),
    persistPage: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("PostgreSQL Square catalog synchronization", () => {
  it("allows Sandbox reads and blocks Production until explicitly approved", () => {
    expect(() => requireReadOnlySquareSyncAllowed("sandbox")).not.toThrow();
    expect(() => requireReadOnlySquareSyncAllowed("production")).toThrow(SquareProductionSyncDisabledError);
    expect(() => requireReadOnlySquareSyncAllowed("production", true)).not.toThrow();
  });

  it("pages from the persisted Square cursor and advances only after persistence", async () => {
    const persistence = store();
    const search = vi.fn()
      .mockResolvedValueOnce({ objects: [{ id: "item-1", type: "ITEM" } as CatalogObject], cursor: "next", latestTime: "2026-07-15T11:00:00Z" })
      .mockResolvedValueOnce({ objects: [], latestTime: "2026-07-15T12:00:00Z" });

    const result = await synchronizeSquareCatalogChanges({ environment: "sandbox", source: { search }, store: persistence });

    expect(search).toHaveBeenNthCalledWith(1, { beginTime: "2026-07-15T10:00:00Z", cursor: undefined });
    expect(search).toHaveBeenNthCalledWith(2, { beginTime: "2026-07-15T10:00:00Z", cursor: "next" });
    expect(persistence.persistPage).toHaveBeenCalledTimes(2);
    expect(persistence.complete).toHaveBeenCalledWith("sandbox", "lease", "2026-07-15T12:00:00Z", expect.any(Date));
    expect(result).toMatchObject({ pages: 2, objects: 1, latestTime: "2026-07-15T12:00:00Z" });
  });

  it("keeps the previous cursor and records a failed run", async () => {
    const persistence = store({ persistPage: vi.fn().mockRejectedValue(new Error("database unavailable")) });
    await expect(synchronizeSquareCatalogChanges({
      environment: "production",
      source: { search: vi.fn().mockResolvedValue({ objects: [], latestTime: "new-time" }) },
      store: persistence
    })).rejects.toThrow("database unavailable");
    expect(persistence.complete).not.toHaveBeenCalled();
    expect(persistence.fail).toHaveBeenCalledWith("production", "lease", expect.any(Error), expect.any(Date));
  });
});
