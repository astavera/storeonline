import { NextResponse } from "next/server";
import { adminSessionCookieName, isTrustedMutationOrigin } from "@/server/admin/admin-security";

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ ok: false, error: "This logout request could not be verified." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(adminSessionCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
