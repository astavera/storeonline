import { NextRequest } from "next/server";
import { z } from "zod";
import {
  assertReturnSameOrigin,
  consumeReturnRateLimit,
  readReturnsSessionToken,
  returnApiError,
  returnJson
} from "@/server/returns/return-api";
import { createReturnsService, ReturnsServiceError } from "@/server/returns/return-service";

const orderLineIdSchema = z.string().trim().min(1).max(160);

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertReturnSameOrigin(request);
    const sessionToken = readReturnsSessionToken(request);
    const rateLimit = await consumeReturnRateLimit({
      request,
      scope: "evidence-upload",
      identity: sessionToken.slice(-24),
      limit: 20,
      windowMs: 30 * 60_000
    });
    if (!rateLimit.allowed) throw new ReturnsServiceError("EVIDENCE_RATE_LIMITED");
    const form = await request.formData();
    const orderLineId = orderLineIdSchema.parse(form.get("orderLineId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new ReturnsServiceError("EVIDENCE_FILE_REQUIRED");
    await validateImageSignature(file);
    const result = await createReturnsService().uploadEvidence({
      sessionToken,
      orderLineId,
      file
    });
    return returnJson(result);
  } catch (error) {
    return returnApiError(error);
  }
}

async function validateImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
  const png = pngHeader.every((value, index) => bytes[index] === value);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp) throw new ReturnsServiceError("EVIDENCE_FILE_TYPE_INVALID");
}
