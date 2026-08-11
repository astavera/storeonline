import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  assertReturnSameOrigin,
  consumeReturnRateLimit,
  returnApiError,
  returnJson
} from "@/server/returns/return-api";
import { createVerificationHandle } from "@/server/returns/return-security";
import { createReturnsService, isOrderProReturnsError } from "@/server/returns/return-service";

const inputSchema = z.object({
  orderNumber: z.string().trim().min(3).max(100),
  email: z.string().trim().email().max(254),
  postalCode: z.string().trim().min(3).max(12)
}).strict();

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let input: z.infer<typeof inputSchema> | null = null;
  try {
    assertReturnSameOrigin(request);
    input = inputSchema.parse(await request.json());
    const rateLimit = await consumeReturnRateLimit({
      request,
      scope: "verification-start",
      identity: `${input.orderNumber}:${input.email}:${input.postalCode}`,
      limit: 5,
      windowMs: 15 * 60_000
    });
    if (!rateLimit.allowed) return genericAccepted(input, rateLimit.retryAfterSeconds);
    const result = await createReturnsService().startVerification(input);
    return returnJson({
      ok: true,
      accepted: true,
      ...result,
      message: genericMessage
    }, { status: 202 });
  } catch (error) {
    // OrderPRO lookup mismatches are deliberately indistinguishable from a
    // valid lookup. Service outages still fail closed with 503.
    if (input && isOrderProReturnsError(error) && /HTTP_4\d\d$/.test(error.code)) {
      return genericAccepted(input);
    }
    return returnApiError(error);
  }
}

const genericMessage = "If the information matches an order, a verification code will be sent shortly.";

function genericAccepted(input: z.infer<typeof inputSchema>, retryAfterSeconds?: number) {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const verificationHandle = createVerificationHandle({
    challengeId: `decoy-${randomUUID()}`,
    orderNumber: input.orderNumber,
    email: input.email,
    postalCode: input.postalCode,
    expiresAt
  });
  return returnJson({
    ok: true,
    accepted: true,
    verificationHandle,
    expiresAt,
    message: genericMessage
  }, {
    status: 202,
    ...(retryAfterSeconds ? { headers: { "retry-after": String(retryAfterSeconds) } } : {})
  });
}
