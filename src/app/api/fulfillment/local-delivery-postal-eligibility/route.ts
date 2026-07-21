import { NextRequest, NextResponse } from "next/server";
import {
  checkOrderProBalloonPostalEligibility,
  isOrderProDeliveryTestMode
} from "@/server/orderpro/orderpro-local-delivery-service";

export async function POST(request: NextRequest) {
  try {
    const eligibility = await checkOrderProBalloonPostalEligibility(await request.json());
    const status = eligibility.eligible
      ? 200
      : eligibility.reasonCode === "INVALID_POSTAL_CODE"
        ? 400
        : eligibility.reasonCode === "OUTSIDE_DELIVERY_AREA"
          ? 422
          : 503;

    return NextResponse.json({ eligibility }, { status });
  } catch {
    return NextResponse.json({
      eligibility: {
        eligible: false,
        source: isOrderProDeliveryTestMode() ? "MOCK" : "ORDERPRO",
        reasonCode: "ORDERPRO_UNAVAILABLE",
        message: "We could not ask OrderPro about this ZIP code. Please try again or choose pickup."
      }
    }, { status: 503 });
  }
}
