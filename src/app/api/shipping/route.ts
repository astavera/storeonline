import { NextResponse } from "next/server";
import { getInitialShippingProviders } from "@/server/shipping/shipping-service";

export async function GET() {
  return NextResponse.json({
    providers: getInitialShippingProviders(),
    policy: "Shippo is the first abstraction; FedEx/UPS direct integrations can be added behind the same server contract."
  });
}
