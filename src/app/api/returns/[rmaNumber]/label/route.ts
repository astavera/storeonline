import { NextRequest } from "next/server";
import {
  readReturnsSessionToken,
  returnApiError
} from "@/server/returns/return-api";
import { getReturnsRepository } from "@/server/returns/return-repository";
import { createReturnsService, ReturnsServiceError } from "@/server/returns/return-service";
import { downloadReturnLabel } from "@/server/returns/shippo-return-label";

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
    if (!record?.shippoTransactionId) throw new ReturnsServiceError("RETURN_LABEL_NOT_AVAILABLE");
    const bytes = await downloadReturnLabel({ transactionId: record.shippoTransactionId });
    return new Response(bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${safeFilename(record.rmaNumber)}-return-label.pdf"`,
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
