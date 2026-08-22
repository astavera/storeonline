// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

import AdminReturnsPage from "@/app/(admin)/admin/returns/page";

describe("legacy Admin Returns route", () => {
  it("redirects to the consolidated Returns tab and preserves filters", async () => {
    await AdminReturnsPage({
      searchParams: Promise.resolve({ q: "RMA 12", status: "REQUESTED", page: "3" })
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/admin/orders?tab=returns&q=RMA+12&status=REQUESTED&page=3"
    );
  });
});
