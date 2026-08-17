/**
 * Handles HTTP requests for the API cart endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

export async function GET() {
  try {
    const quote = await quoteCartFromOperationalCatalog({ items: [] });
    return NextResponse.json({
      quote,
      policy: "Cart items store Square variation IDs and are validated against the synchronized Square catalog."
    });
  } catch (error) {
    const status = error instanceof PersistenceUnavailableError ? 503 : 400;
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Catalog unavailable."]
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const quote = await quoteCartFromOperationalCatalog({
      items: Array.isArray(body.items) ? body.items : [],
      ...(typeof body.locationId === "string" ? { locationId: body.locationId } : {})
    });

    return NextResponse.json({
      ok: quote.errors.length === 0,
      quote,
      errors: quote.errors
    });
  } catch (error) {
    const status = error instanceof PersistenceUnavailableError ? 503 : 400;
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Invalid cart."]
      },
      { status }
    );
  }
}
