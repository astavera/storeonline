import { NextResponse } from "next/server";
import { getSquareRuntimeConfig } from "@/server/square/client";

export async function GET() {
  return NextResponse.json({
    square: getSquareRuntimeConfig(),
    policy: "Server-only. No Square secrets are exposed to the browser."
  });
}
