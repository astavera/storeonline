import { NextRequest } from "next/server";
import { z } from "zod";
import { returnLineSelectionSchema } from "@/features/returns/contracts";
import {
  assertReturnSameOrigin,
  readReturnsSessionToken,
  returnApiError,
  returnJson
} from "@/server/returns/return-api";
import { createReturnsService } from "@/server/returns/return-service";

const inputSchema = z.object({
  selections: z.array(returnLineSelectionSchema).min(1).max(100)
}).strict();

export async function POST(request: NextRequest) {
  try {
    assertReturnSameOrigin(request);
    const input = inputSchema.parse(await request.json());
    const result = await createReturnsService().quote({
      sessionToken: readReturnsSessionToken(request),
      selections: input.selections
    });
    return returnJson({ ok: true, quote: result.view });
  } catch (error) {
    return returnApiError(error);
  }
}
