import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertReturnSameOrigin,
  consumeReturnRateLimit,
  RETURNS_SESSION_COOKIE,
  returnApiError,
  returnNoStoreHeaders,
  returnsSessionCookieOptions
} from "@/server/returns/return-api";
import { createReturnsService, isOrderProReturnsError } from "@/server/returns/return-service";

const inputSchema = z.object({
  verificationHandle: z.string().min(40).max(4_000),
  code: z.string().trim().regex(/^[A-Za-z0-9]{4,12}$/)
}).strict();

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertReturnSameOrigin(request);
    const input = inputSchema.parse(await request.json());
    const rateLimit = await consumeReturnRateLimit({
      request,
      scope: "verification-confirm",
      identity: input.verificationHandle.slice(-64),
      limit: 6,
      windowMs: 15 * 60_000
    });
    if (!rateLimit.allowed) return verificationFailed(429, rateLimit.retryAfterSeconds);
    const order = await createReturnsService().confirmVerification(input);
    const { sessionToken, ...publicOrder } = order;
    if (!sessionToken) throw new Error("Return session token was not created.");
    const response = NextResponse.json(
      { ok: true, order: publicOrder },
      { headers: returnNoStoreHeaders }
    );
    response.cookies.set(RETURNS_SESSION_COOKIE, sessionToken, returnsSessionCookieOptions());
    return response;
  } catch (error) {
    if (isOrderProReturnsError(error)) return verificationFailed(400);
    return returnApiError(error);
  }
}

function verificationFailed(status: number, retryAfterSeconds?: number) {
  return NextResponse.json({
    ok: false,
    code: "VERIFICATION_FAILED",
    message: "We could not verify that request. Check the code and try again."
  }, {
    status,
    headers: {
      ...returnNoStoreHeaders,
      ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {})
    }
  });
}
