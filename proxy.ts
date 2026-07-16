import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";

export async function proxy(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/admin")) {
    return adminAuthorizationResponse(authorization);
  }

  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
