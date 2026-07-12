import { describe, expect, it } from "vitest";
import { primaryNavigation, secondaryDepartmentNavigation } from "@/config/navigation.config";

describe("navigation", () => {
  it("keeps Candy & Snacks out of primary and secondary department navigation", () => {
    const labels = [...primaryNavigation, ...secondaryDepartmentNavigation].map((item) => item.label.toLowerCase());

    expect(labels).not.toContain("candy & snacks");
    expect(labels).not.toContain("candy and snacks");
  });

  it("uses top-level department routes instead of collections routes", () => {
    const hrefs = [...primaryNavigation, ...secondaryDepartmentNavigation].map((item) => item.href);

    expect(hrefs.every((href) => !href.startsWith("/collections"))).toBe(true);
    expect(hrefs).toEqual(expect.arrayContaining(["/toys", "/party-supplies", "/balloons", "/stationery", "/arts-and-crafts", "/greeting-cards", "/gifts"]));
  });
});
