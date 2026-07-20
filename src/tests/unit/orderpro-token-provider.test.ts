// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAuth0TokenProvider, OrderProTokenError } from "@/server/orderpro/auth0-token-provider";
import type { OrderProAuth0Configuration } from "@/server/orderpro/config";

const config: OrderProAuth0Configuration = {
  tokenEndpoint: "https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/oauth/token",
  audience: "https://api.orderpro.internal/local-delivery/staging",
  clientId: "storefront-client",
  clientSecret: "server-secret-value",
  scopes: ["local-delivery:holds", "local-delivery:quote"]
};

function tokenResponse(accessToken: string, expiresIn = 3600, scope = "local-delivery:holds local-delivery:quote") {
  return new Response(
    JSON.stringify({ access_token: accessToken, token_type: "Bearer", expires_in: expiresIn, scope }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function jwtToken(subject: string) {
  return `eyJhbGciOiJSUzI1NiJ9.${subject}.signature`;
}

describe("Auth0 token provider", () => {
  it("sends the exact Client Credentials request and shares a cached token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse(jwtToken("one")));
    const provider = createAuth0TokenProvider({ config, fetchImpl: fetchMock as typeof fetch, now: () => 1_000 });

    const [first, second] = await Promise.all([provider.getAccessToken(), provider.getAccessToken()]);

    expect(first).toBe(jwtToken("one"));
    expect(second).toBe(jwtToken("one"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(config.tokenEndpoint);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
      grant_type: "client_credentials",
      scope: "local-delivery:holds local-delivery:quote"
    });
  });

  it("refreshes after the clock-skew boundary and supports explicit invalidation", async () => {
    let now = 1_000;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse(jwtToken("one")))
      .mockResolvedValueOnce(tokenResponse(jwtToken("two")))
      .mockResolvedValueOnce(tokenResponse(jwtToken("three")));
    const provider = createAuth0TokenProvider({ config, fetchImpl: fetchMock as typeof fetch, now: () => now });

    expect(await provider.getAccessToken()).toBe(jwtToken("one"));
    now += 3_540_001;
    expect(await provider.getAccessToken()).toBe(jwtToken("two"));
    provider.invalidate();
    expect(await provider.getAccessToken()).toBe(jwtToken("three"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects unexpected scopes and lifetime without leaking response values", async () => {
    const sensitiveToken = jwtToken("sensitive-token");
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse(sensitiveToken, 7200, "local-delivery:quote"));
    const provider = createAuth0TokenProvider({ config, fetchImpl: fetchMock as typeof fetch });

    const error = await provider.getAccessToken().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(OrderProTokenError);
    expect(error).toMatchObject({ code: "TOKEN_RESPONSE_INVALID" });
    expect(String(error)).not.toContain(sensitiveToken);
    expect(String(error)).not.toContain(config.clientSecret);
  });

  it("does not cache a rejected token request", async () => {
    const recoveredToken = jwtToken("recovered-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("denied", { status: 401 })).mockResolvedValueOnce(tokenResponse(recoveredToken));
    const provider = createAuth0TokenProvider({ config, fetchImpl: fetchMock as typeof fetch });

    await expect(provider.getAccessToken()).rejects.toMatchObject({ code: "TOKEN_REQUEST_FAILED" });
    await expect(provider.getAccessToken()).resolves.toBe(recoveredToken);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects opaque or oversized access tokens", async () => {
    const opaqueProvider = createAuth0TokenProvider({
      config,
      fetchImpl: vi.fn().mockResolvedValue(tokenResponse("opaque-token")) as typeof fetch
    });
    const oversizedProvider = createAuth0TokenProvider({
      config,
      fetchImpl: vi.fn().mockResolvedValue(tokenResponse(`header.${"a".repeat(8192)}.signature`)) as typeof fetch
    });

    await expect(opaqueProvider.getAccessToken()).rejects.toMatchObject({ code: "TOKEN_RESPONSE_INVALID" });
    await expect(oversizedProvider.getAccessToken()).rejects.toMatchObject({ code: "TOKEN_RESPONSE_INVALID" });
  });
});
