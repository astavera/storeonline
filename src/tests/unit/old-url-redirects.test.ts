import { describe, expect, it } from "vitest";
import { oldUrlRedirects } from "@/config/old-url-redirects.config";

describe("old URL redirects", () => {
  it("redirects legacy department pages to top-level department routes", () => {
    const redirects = new Map(oldUrlRedirects.map((redirect) => [redirect.source, redirect.destination]));

    expect(redirects.get("/read/65/toys")).toBe("/toys");
    expect(redirects.get("/read/47/party-supplies")).toBe("/party-supplies");
    expect(redirects.get("/read/49/arts-crafts")).toBe("/arts-and-crafts");
    expect(redirects.get("/read/63/balloons")).toBe("/balloons");
    expect(redirects.get("/read/58/seasonal-specials")).toBe("/holidays");
  });

  it("does not redirect legacy Candy & Snacks into a main department", () => {
    const candyRedirect = oldUrlRedirects.find((redirect) => redirect.source === "/read/52/candy-candy-candy");

    expect(candyRedirect?.destination).toBe("/shop");
  });
});
