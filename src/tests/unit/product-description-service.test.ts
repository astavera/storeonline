import { describe, expect, it } from "vitest";
import { detectSquareDescriptionChange, resolveProductDescription, sanitizeSquareDescriptionHtml } from "@/features/catalog/services/product-description-service";

describe("product description service", () => {
  it("sanitizes Square description HTML with an allowlist", () => {
    const html = '<p onclick="alert(1)">Safe <strong>copy</strong><script>alert(1)</script><iframe src="x"></iframe><a href="javascript:bad()">bad</a></p>';

    expect(sanitizeSquareDescriptionHtml(html)).toBe("<p>Safe <strong>copy</strong>bad</p>");
  });

  it("prefers approved website override over Square descriptions", () => {
    const resolved = resolveProductDescription(
      { descriptionHtml: "<p>Square copy</p>", squareDescriptionHash: "square-a" },
      {
        webDescriptionEn: "<p>Website copy</p>",
        descriptionSource: "ADMIN_APPROVED",
        descriptionStatus: "READY",
        useSquareDescription: false,
        lockWebDescription: true,
        squareDescriptionHash: "square-a"
      }
    );

    expect(resolved.html).toBe("<p>Website copy</p>");
    expect(resolved.source).toBe("ADMIN_APPROVED");
  });

  it("marks manual overrides as outdated when Square description changes", () => {
    const status = detectSquareDescriptionChange(
      { squareDescriptionHash: "new-hash" },
      {
        webDescriptionEn: "Website copy",
        descriptionSource: "WEBSITE_OVERRIDE",
        descriptionStatus: "READY",
        useSquareDescription: false,
        lockWebDescription: true,
        squareDescriptionHash: "old-hash"
      }
    );

    expect(status).toBe("OUTDATED_SQUARE_CHANGED");
  });
});
