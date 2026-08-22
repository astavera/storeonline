/** Verifies the storefront 404 page keeps both recovery paths available. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";

describe("storefront not-found page", () => {
  it("offers clear routes back home and into the full catalog", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "Looks like this page got a little tangled up." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Shop all" }).getAttribute("href")).toBe("/shop");
  });
});
