import { NextRequest } from "next/server";
import {
  readReturnsSessionToken,
  returnApiError
} from "@/server/returns/return-api";
import { createReturnPackingSlipPdf } from "@/server/returns/return-packing-slip";
import { getReturnsRepository } from "@/server/returns/return-repository";
import { createReturnsService, ReturnsServiceError } from "@/server/returns/return-service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rmaNumber: string }> }
) {
  try {
    const sessionToken = readReturnsSessionToken(request);
    const session = await createReturnsService().requireSession(sessionToken);
    const { rmaNumber } = await context.params;
    const record = await getReturnsRepository().findRequestForSession({
      sessionId: session.id,
      rmaNumber
    });
    if (!record) throw new ReturnsServiceError("RETURN_NOT_FOUND");
    const pdf = createReturnPackingSlipPdf(record);
    return new Response(pdf, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${safeFilename(record.rmaNumber)}-packing-slip.pdf"`,
        "content-type": "application/pdf",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return returnApiError(error);
  }
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "return";
}
