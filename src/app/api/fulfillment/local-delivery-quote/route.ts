/**
 * Handles HTTP requests for the API fulfillment local delivery quote endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isOrderProDeliveryTestMode,
  quoteOrderProLocalDelivery
} from "@/server/orderpro/orderpro-local-delivery-service";

export async function POST(request: NextRequest) {
  try {
    const quote = await quoteOrderProLocalDelivery(await request.json());
    const status = quote.eligible
      ? 200
      : quote.reasonCode === "OUTSIDE_WALKING_AREA" || quote.reasonCode === "TEST_ADDRESS_UNAVAILABLE"
        ? 422
        : quote.reasonCode === "INVALID_ADDRESS"
          ? 400
          : 503;

    return NextResponse.json({ quote }, { status });
  } catch {
    return NextResponse.json({
      quote: {
        eligible: false,
        source: isOrderProDeliveryTestMode() ? "MOCK" : "ORDERPRO",
        reasonCode: "ORDERPRO_UNAVAILABLE",
        message: "We could not check local delivery. Please try again or choose pickup."
      }
    }, { status: 503 });
  }
}
