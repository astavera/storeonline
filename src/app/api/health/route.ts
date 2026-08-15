/**
 * Handles HTTP requests for the API health endpoint.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { service: "storefront", status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

