/**
 * Mirrors authenticated OrderPRO receipt and inventory-disposition events.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/validation/env";
import { returnsStatusSchema } from "@/features/returns/contracts";
import { getReturnsRepository } from "@/server/returns/return-repository";

const inputSchema = z.object({
  eventId: z.string().trim().min(8).max(200),
  orderProRmaId: z.string().trim().min(1).max(200),
  status: returnsStatusSchema,
  occurredAt: z.string().datetime(),
  inventoryEvents: z.array(z.object({
    orderLineId: z.string().trim().min(1).max(160),
    quantity: z.number().int().positive().max(100),
    event: z.enum(["RETURNED", "RETURN_STAGED", "QUARANTINED", "PUTAWAY", "AVAILABLE_ONLINE", "DAMAGED", "MANUAL_REVIEW"])
  }).strict()).max(400).default([])
}).strict();

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-orderpro-returns-key"))) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const input = inputSchema.parse(await request.json());
    const repository = getReturnsRepository();
    const record = await repository.findRequestByOrderProRmaId(input.orderProRmaId);
    if (!record) return NextResponse.json({ ok: false, error: "RMA_NOT_FOUND" }, { status: 404 });
    if (input.status === "RECEIVED") {
      const invalidInitialEvent = input.inventoryEvents.some((event) =>
        !["RETURNED", "RETURN_STAGED", "QUARANTINED"].includes(event.event)
      );
      if (invalidInitialEvent) {
        return NextResponse.json({ ok: false, error: "INVALID_RECEIPT_DISPOSITION" }, { status: 422 });
      }
    }
    const result = await repository.appendStatusEvent({
      requestId: record.id,
      status: input.status,
      source: "orderpro",
      externalEventId: input.eventId,
      occurredAt: new Date(input.occurredAt),
      details: { inventoryEvents: input.inventoryEvents }
    });
    return NextResponse.json(
      { ok: true, replayed: result.replayed, status: result.record.status },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "EVENT_NOT_APPLIED" }, { status: 422 });
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
