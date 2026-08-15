import { NextRequest } from "next/server";
import {
  readReturnsSessionToken,
  returnApiError,
  returnJson
} from "@/server/returns/return-api";
import { createReturnsService } from "@/server/returns/return-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const order = await createReturnsService().getOrder(readReturnsSessionToken(request));
    return returnJson({
      ok: true,
      order: {
        expiresAt: order.expiresAt,
        orderNumber: order.orderNumber,
        deliveredAt: order.deliveredAt,
        currency: order.currency,
        lines: order.lines
      }
    });
  } catch (error) {
    return returnApiError(error);
  }
}
