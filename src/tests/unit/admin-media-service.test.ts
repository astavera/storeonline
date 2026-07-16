import { describe, expect, it } from "vitest";
import {
  adminMediaUploadMaxBytes,
  buildAdminMediaUploadMetadata,
  validateAdminImageContent,
  validateAdminImageUpload
} from "@/server/admin/admin-media-service";

describe("admin media service", () => {
  it("builds a safe public upload URL for admin images", () => {
    const metadata = buildAdminMediaUploadMetadata({
      id: "018f6685-5398-73e2-87ed-b870401df1ad",
      name: "../Store Front Hero.PNG",
      size: 1200,
      type: "image/png"
    });

    expect(metadata).toEqual({
      ok: true,
      asset: {
        fileName: "018f6685-5398-73e2-87ed-b870401df1ad.png",
        mimeType: "image/png",
        originalName: "../Store Front Hero.PNG",
        size: 1200,
        url: "/uploads/admin/018f6685-5398-73e2-87ed-b870401df1ad.png"
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
    ).toEqual(["Upload must be a JPG, PNG, WEBP, or GIF image. SVG is not accepted.", "Upload must be 5 MB or smaller."]);
  });

  it("rejects SVG and mismatched extensions", () => {
    expect(buildAdminMediaUploadMetadata({
      name: "Back to School Ecommerce Wireframe.svg",
      size: 774358,
      type: "image/svg+xml"
    })).toEqual({ ok: false, errors: ["Upload must be a JPG, PNG, WEBP, or GIF image. SVG is not accepted."] });

    expect(validateAdminImageUpload({ name: "hero.jpg", size: 100, type: "image/png" }))
      .toEqual(["The file extension does not match the declared image type."]);
  });

  it("checks the file signature instead of trusting browser MIME metadata", () => {
    expect(validateAdminImageContent(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toEqual([]);
    expect(validateAdminImageContent(new TextEncoder().encode("<svg><script/></svg>"), "image/png"))
      .toEqual(["The uploaded bytes do not match the declared image type."]);
  });
});
