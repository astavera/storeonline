/** Verifies that legacy logout expires the browser session cookie safely. */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/admin/admin-security", () => ({
  adminSessionCookieName: "modern_state_admin",
  isTrustedMutationOrigin: () => true
}));
vi.mock("@/server/storefront/admin-preview-response", () => ({ storefrontAdminPreviewRouteResponse: () => null }));

import { POST } from "@/app/api/admin/auth/logout/route";

afterEach(() => vi.unstubAllEnvs());

describe("Admin logout route", () => {
  it("expires the secure browser cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(new Request("https://modernstate.com/api/admin/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("modern_state_admin=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });
});
