/**
 * Receives authenticated, idempotent inspection decisions from OrderPRO.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/validation/env";
import { createReturnInspectionService, inspectionResultSchema } from "@/server/returns/return-inspection-service";

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-orderpro-returns-key"))) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const input = inspectionResultSchema.parse(await request.json());
    const result = await createReturnInspectionService().process(input);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false, error: "INSPECTION_NOT_APPLIED" },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function authorized(received: string | null) {
  const expected = env.ORDERPRO_STOREFRONT_RETURNS_SHARED_SECRET;
  if (!received || !expected) return false;
  return timingSafeEqual(
    createHash("sha256").update(received).digest(),
    createHash("sha256").update(expected).digest()
  );
}
