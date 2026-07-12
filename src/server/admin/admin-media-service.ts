export const adminMediaUploadMaxBytes = 5 * 1024 * 1024;

const allowedImageTypes: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp"
};

export type AdminMediaUploadMetadataInput = {
  context?: string;
  name: string;
  now?: Date;
  size: number;
  type: string;
};

export type AdminMediaUploadMetadata = {
  fileName: string;
  mimeType: string;
  originalName: string;
  size: number;
  url: string;
};

export function buildAdminMediaUploadMetadata(input: AdminMediaUploadMetadataInput) {
  const errors = validateAdminImageUpload(input);

  if (errors.length > 0) {
    return {
      ok: false as const,
      errors
    };
  }

  const uploadedAt = input.now ?? new Date();
  const timestamp = uploadedAt.toISOString().replace(/\D/g, "").slice(0, 14);
  const context = sanitizeFileNamePart(input.context || "admin");
  const baseName = sanitizeFileNamePart(stripExtension(input.name) || "image");
  const extension = allowedImageTypes[input.type];
  const fileName = `${timestamp}-${context}-${baseName}.${extension}`;

  return {
    ok: true as const,
    asset: {
      fileName,
      mimeType: input.type,
      originalName: input.name,
      size: input.size,
      url: `/uploads/admin/${fileName}`
    } satisfies AdminMediaUploadMetadata,
    errors: []
  };
}

export function validateAdminImageUpload(input: Pick<AdminMediaUploadMetadataInput, "name" | "size" | "type">) {
  const errors: string[] = [];

  if (!input.name.trim()) {
    errors.push("Image file name is required.");
  }

  if (!allowedImageTypes[input.type]) {
    errors.push("Upload must be a JPG, PNG, WEBP, GIF, or SVG image.");
  }

  if (input.size <= 0) {
    errors.push("Upload file is empty.");
  }

  if (input.size > adminMediaUploadMaxBytes) {
    errors.push("Upload must be 5 MB or smaller.");
  }

  return errors;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function sanitizeFileNamePart(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 64) || "image";
}
