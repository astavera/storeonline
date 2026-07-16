import { randomUUID } from "node:crypto";
import path from "node:path";

export const adminMediaUploadMaxBytes = 5 * 1024 * 1024;

const allowedImageTypes: Record<string, { extension: string; acceptedExtensions: string[] }> = {
  "image/gif": { extension: "gif", acceptedExtensions: [".gif"] },
  "image/jpeg": { extension: "jpg", acceptedExtensions: [".jpg", ".jpeg"] },
  "image/png": { extension: "png", acceptedExtensions: [".png"] },
  "image/webp": { extension: "webp", acceptedExtensions: [".webp"] }
};

export type AdminMediaUploadMetadataInput = {
  context?: string;
  id?: string;
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

  const extension = allowedImageTypes[input.type].extension;
  const id = input.id ?? randomUUID();
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
    return { ok: false as const, errors: ["Unable to generate a safe upload identifier."] };
  }
  const fileName = `${id}.${extension}`;

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

  const allowedType = allowedImageTypes[input.type];
  if (!allowedType) {
    errors.push("Upload must be a JPG, PNG, WEBP, or GIF image. SVG is not accepted.");
  } else if (!allowedType.acceptedExtensions.includes(path.extname(input.name).toLowerCase())) {
    errors.push("The file extension does not match the declared image type.");
  }

  if (input.size <= 0) {
    errors.push("Upload file is empty.");
  }

  if (input.size > adminMediaUploadMaxBytes) {
    errors.push("Upload must be 5 MB or smaller.");
  }

  return errors;
}

export function validateAdminImageContent(bytes: Uint8Array, declaredType: string) {
  const matches =
    declaredType === "image/png"
      ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : declaredType === "image/jpeg"
        ? startsWith(bytes, [0xff, 0xd8, 0xff])
        : declaredType === "image/gif"
          ? startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a")
          : declaredType === "image/webp"
            ? startsWithAscii(bytes, "RIFF") && asciiAt(bytes, 8, "WEBP")
            : false;

  return matches ? [] : ["The uploaded bytes do not match the declared image type."];
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function startsWithAscii(bytes: Uint8Array, signature: string) {
  return asciiAt(bytes, 0, signature);
}

function asciiAt(bytes: Uint8Array, offset: number, signature: string) {
  return Array.from(signature).every((value, index) => bytes[offset + index] === value.charCodeAt(0));
}
