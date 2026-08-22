import { describe, expect, it, vi } from "vitest";
import AdminProductPlacementPage from "@/app/(admin)/admin/product-placement/page";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

describe("legacy product placement route", () => {
  it("redirects to the canonical Website publishing tab", () => {
    AdminProductPlacementPage();

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/admin/products?tab=publishing");
  });
});
