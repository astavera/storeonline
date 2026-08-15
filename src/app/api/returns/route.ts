import { NextRequest } from "next/server";
import { z } from "zod";
import { returnLineSelectionSchema } from "@/features/returns/contracts";
import {
  assertReturnSameOrigin,
  readReturnsSessionToken,
  returnApiError,
  returnJson
} from "@/server/returns/return-api";
import { createReturnsService, ReturnsServiceError } from "@/server/returns/return-service";

const inputSchema = z.object({
  quoteToken: z.string().min(40).max(20_000),
  selections: z.array(returnLineSelectionSchema).min(1).max(100),
  policyAccepted: z.literal(true),
  conditionAccepted: z.literal(true),
  labelDeductionAccepted: z.boolean()
}).strict();

export async function POST(request: NextRequest) {
  try {
    assertReturnSameOrigin(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
      throw new ReturnsServiceError("IDEMPOTENCY_KEY_INVALID");
    }
    const input = inputSchema.parse(await request.json());
    const result = await createReturnsService().createRequest({
      sessionToken: readReturnsSessionToken(request),
      idempotencyKey,
      ...input
    });
    return returnJson({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return returnApiError(error);
  }
}
