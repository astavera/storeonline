import { NextRequest, NextResponse } from "next/server";
import { getOrderProPickupAvailability } from "@/server/orderpro/orderpro-pickup-slot-service";

export async function POST(request: NextRequest) {
  try {
    const availability = await getOrderProPickupAvailability(await request.json());
    const status = availability.available
      ? 200
      : availability.reasonCode === "INVALID_REQUEST"
        ? 400
        : availability.reasonCode === "LOCATION_UNAVAILABLE" || availability.reasonCode === "NO_AVAILABLE_SLOTS"
          ? 422
          : 503;
    return NextResponse.json({ availability }, { status });
  } catch {
    return NextResponse.json({
      availability: {
        available: false,
        source: "MOCK",
        reasonCode: "ORDERPRO_UNAVAILABLE",
        message: "We could not load pickup times. Please try again."
      }
    }, { status: 503 });
  }
}
