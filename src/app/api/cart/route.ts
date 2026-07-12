import { NextRequest, NextResponse } from "next/server";
import { quoteCart } from "@/server/checkout/cart-service";

export async function GET() {
  return NextResponse.json({
    quote: quoteCart({ items: [] }),
    policy: "Cart items store Square variation IDs and are validated server-side before checkout."
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const quote = quoteCart({
      items: Array.isArray(body.items) ? body.items : []
    });

    return NextResponse.json({
      ok: quote.errors.length === 0,
      quote,
      errors: quote.errors
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Invalid cart."]
      },
      { status: 400 }
    );
  }
}
