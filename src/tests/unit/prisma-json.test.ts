/**
 * Verifies the isolated behavior of prisma JSON.
 */

import { describe, expect, it } from "vitest";
import { toPrismaJson } from "@/server/prisma-json";

describe("toPrismaJson", () => {
  it("normalizes a payload to JSON-safe values", () => {
    expect(
      toPrismaJson({
        enabled: true,
        omitted: undefined,
        values: [1, null, "ready"]
      })
    ).toEqual({
      enabled: true,
      values: [1, null, "ready"]
    });
  });

  it("rejects a non-serializable root value", () => {
    expect(() => toPrismaJson(undefined)).toThrow("Prisma JSON payload must be serializable.");
  });
});
