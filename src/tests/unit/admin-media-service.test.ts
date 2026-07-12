import { describe, expect, it } from "vitest";
import { adminMediaUploadMaxBytes, buildAdminMediaUploadMetadata, validateAdminImageUpload } from "@/server/admin/admin-media-service";

describe("admin media service", () => {
  it("builds a safe public upload URL for admin images", () => {
    const metadata = buildAdminMediaUploadMetadata({
      context: "home.hero",
      name: "../Store Front Hero.PNG",
      now: new Date("2026-07-09T14:30:05.000Z"),
      size: 1200,
      type: "image/png"
    });

    expect(metadata).toEqual({
      ok: true,
      asset: {
        fileName: "20260709143005-home-hero-store-front-hero.png",
        mimeType: "image/png",
        originalName: "../Store Front Hero.PNG",
        size: 1200,
        url: "/uploads/admin/20260709143005-home-hero-store-front-hero.png"
      },
      errors: []
    });
  });

  it("rejects unsupported or oversized uploads", () => {
    expect(
      validateAdminImageUpload({
        name: "hero.pdf",
        size: adminMediaUploadMaxBytes + 1,
        type: "application/pdf"
      })
    ).toEqual(["Upload must be a JPG, PNG, WEBP, GIF, or SVG image.", "Upload must be 5 MB or smaller."]);
  });

  it("allows SVG uploads for editable hero artwork", () => {
    const metadata = buildAdminMediaUploadMetadata({
      context: "home.hero",
      name: "Back to School Ecommerce Wireframe.svg",
      now: new Date("2026-07-10T11:30:45.000Z"),
      size: 774358,
      type: "image/svg+xml"
    });

    expect(metadata).toEqual({
      ok: true,
      asset: {
        fileName: "20260710113045-home-hero-back-to-school-ecommerce-wireframe.svg",
        mimeType: "image/svg+xml",
        originalName: "Back to School Ecommerce Wireframe.svg",
        size: 774358,
        url: "/uploads/admin/20260710113045-home-hero-back-to-school-ecommerce-wireframe.svg"
      },
      errors: []
    });
  });
});
