import { describe, expect, it } from "vitest";
import {
  createDatabaseCmsVersion,
  type CmsVersionTransactionRunner,
  type CreateCmsVersionInput
} from "@/server/db/cms-version-repository";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

const input: CreateCmsVersionInput = {
  entityType: "CMS_homepage",
  entityId: "home",
  status: "DRAFT",
  title: "Homepage",
  payload: { sections: [] }
};

describe("CMS version repository", () => {
  it("serializes concurrent writes into distinct monotonic versions", async () => {
    let latestVersion = 0;
    let queue = Promise.resolve();
    const runner: CmsVersionTransactionRunner = {
      async $transaction<T>(operation: Parameters<CmsVersionTransactionRunner["$transaction"]>[0]) {
        const previous = queue;
        let release: () => void = () => {};
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
          return await operation({
            cmsContentVersion: {
              async findFirst() {
                return latestVersion === 0 ? null : { versionNumber: latestVersion };
              },
              async create(args) {
                const versionNumber = (args as { data: { versionNumber: number } }).data.versionNumber;
                latestVersion = versionNumber;
                return { id: `version-${versionNumber}`, versionNumber };
              }
            }
          }) as T;
        } finally {
          release();
        }
      }
    };

    const created = await Promise.all([
      createDatabaseCmsVersion(input, runner),
      createDatabaseCmsVersion(input, runner)
    ]);

    expect(created.map((record) => record.versionNumber)).toEqual([1, 2]);
  });

  it("retries a bounded serialization conflict", async () => {
    let attempts = 0;
    const runner: CmsVersionTransactionRunner = {
      async $transaction<T>(operation: Parameters<CmsVersionTransactionRunner["$transaction"]>[0]) {
        attempts += 1;
        if (attempts === 1) throw { code: "P2034" };
        return await operation({
          cmsContentVersion: {
            async findFirst() { return { versionNumber: 7 }; },
            async create() { return { id: "version-8", versionNumber: 8 }; }
          }
        }) as T;
      }
    };

    await expect(createDatabaseCmsVersion(input, runner)).resolves.toMatchObject({ versionNumber: 8 });
    expect(attempts).toBe(2);
  });

  it("fails closed with a sanitized persistence error", async () => {
    const runner: CmsVersionTransactionRunner = {
      async $transaction() {
        throw new Error("postgresql://user:password@private-host/database");
      }
    };

    const failure = createDatabaseCmsVersion(input, runner, 1);
    await expect(failure).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(failure).rejects.not.toThrow(/password|private-host/);
  });
});
