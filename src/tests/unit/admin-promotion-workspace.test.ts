import { describe, expect, it } from "vitest";

import { extractPromotionSections } from "@/server/admin/admin-promotion-workspace";

describe("Admin promotion workspace", () => {
  it("extracts only controlled promotional sections from nested CMS payloads", () => {
    expect(extractPromotionSections({
      sections: [
        { type: "countdownPromo", title: "Back to school" },
        { type: "productGrid", title: "Products" },
        { type: "heroCarousel", settings: { heading: "Seasonal hero" } }
      ]
    })).toEqual([
      { name: "Back to school", sectionType: "countdownPromo" },
      { name: "Hero Carousel", sectionType: "heroCarousel" }
    ]);
  });

  it("bounds traversal output and ignores arbitrary strings", () => {
    expect(extractPromotionSections({ title: "Promo", sections: [{ type: "customCode", title: "Unsafe" }] })).toEqual([]);
  });
});
