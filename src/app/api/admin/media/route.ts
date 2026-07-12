import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { buildAdminMediaUploadMetadata } from "@/server/admin/admin-media-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const context = String(formData.get("context") ?? "admin");

    if (!isUploadFile(file)) {
      return NextResponse.json(
        {
          ok: false,
          errors: ["Image file is required."]
        },
        { status: 400 }
      );
    }

    const metadata = buildAdminMediaUploadMetadata({
      context,
      name: file.name,
      size: file.size,
      type: file.type
    });

    if (!metadata.ok) {
      return NextResponse.json(metadata, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "admin");
    const uploadPath = path.join(uploadDir, metadata.asset.fileName);
    const bytes = Buffer.from(await file.arrayBuffer());

    await mkdir(uploadDir, { recursive: true });
    await writeFile(uploadPath, bytes);

    return NextResponse.json({
      ok: true,
      asset: metadata.asset,
      storage: {
        mode: "public-folder",
        persisted: true,
        message: "Uploaded to public uploads."
      },
      errors: []
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Image upload failed."]
      },
      { status: 400 }
    );
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "size" in value && "type" in value;
}
