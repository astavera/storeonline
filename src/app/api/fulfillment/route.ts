/**
 * Handles HTTP requests for the API fulfillment endpoint.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    modes: ["pickup", "local-delivery", "shipping"],
    policy: "Mixed fulfillment carts must share one compatible mode or be split before checkout."
  });
}
