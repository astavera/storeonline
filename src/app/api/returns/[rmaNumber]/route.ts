import { NextRequest } from "next/server";
import {
  readReturnsSessionToken,
  returnApiError,
  returnJson
} from "@/server/returns/return-api";
import { createReturnsService } from "@/server/returns/return-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rmaNumber: string }> }
) {
  try {
    const { rmaNumber } = await context.params;
    const result = await createReturnsService().getStatus({
      sessionToken: readReturnsSessionToken(request),
      rmaNumber
    });
    return returnJson({ ok: true, request: result });
  } catch (error) {
    return returnApiError(error);
  }
}
