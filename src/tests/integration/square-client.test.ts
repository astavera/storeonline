/**
 * Verifies integration behavior for Square client.
 */

import { describe, expect, it } from "vitest";
import { getSquareRuntimeConfig } from "@/server/square/client";

describe("Square runtime config", () => {
  it("does not expose token values through the runtime config", () => {
    const config = getSquareRuntimeConfig();

    expect(config).toHaveProperty("hasAccessToken");
    expect(JSON.stringify(config)).not.toContain("SQUARE_ACCESS_TOKEN");
  });
});
