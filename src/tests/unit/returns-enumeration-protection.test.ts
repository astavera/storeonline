import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { setAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { POST } from "@/app/api/returns/verification/start/route";

describe("return order enumeration protection", () => {
  afterEach(() => setAdminRateLimiter(undefined));

  it("returns the same generic accepted shape for rate-limited lookup identities", async () => {
    process.env.RETURNS_SESSION_SECRET = "returns-test-secret-at-least-32-characters";
    setAdminRateLimiter({
      async consume() {
        return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
      }
    });

    const first = await POST(requestFor({
      orderNumber: "MS-REAL-100",
      email: "customer@example.com",
      postalCode: "10028"
    }));
    const second = await POST(requestFor({
      orderNumber: "MS-NOT-FOUND",
      email: "nobody@example.com",
      postalCode: "99999"
    }));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(Object.keys(firstBody).sort()).toEqual(Object.keys(secondBody).sort());
    expect(firstBody.message).toBe(secondBody.message);
    expect(JSON.stringify(firstBody)).not.toContain("customer@example.com");
    expect(JSON.stringify(secondBody)).not.toContain("MS-NOT-FOUND");
  });
});

function requestFor(body: unknown) {
  return new NextRequest("http://localhost:3000/api/returns/verification/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000"
    },
    body: JSON.stringify(body)
  });
}
