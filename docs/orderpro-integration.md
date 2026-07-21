# OrderPRO STAGING integration

## Current release boundary

The storefront backend can authenticate to OrderPRO through `POST /api/v1/local-delivery/auth-check`. A successful handshake proves the Auth0 issuer, audience, Client Credentials grant, registry client and exact scopes are aligned.

The expected authenticated response still contains:

```json
{
  "result": "AUTHENTICATED",
  "clientId": "storefront-staging",
  "environment": "STAGING",
  "scopes": ["local-delivery:holds", "local-delivery:quote"],
  "localDeliveryApiStatus": "DEPENDENCY_BLOCKED"
}
```

`DEPENDENCY_BLOCKED` is intentional. It does not authorize customer quotes, slots, holds, payments or production traffic. Keep `ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false`.

## Server-only configuration

Configure these values in the storefront backend environment or Vercel project. Never place them in browser JavaScript and never prefix them with `NEXT_PUBLIC_`.

```text
ORDERPRO_M2M_AUTH_MODE=AUTH0
ORDERPRO_INTEGRATION_ENVIRONMENT=STAGING
ORDERPRO_API_BASE_URL=https://orderpro-staging.vercel.app
ORDERPRO_AUTH0_ISSUER=https://dev-rfzzpvgkfg1mwf3m.us.auth0.com/
ORDERPRO_AUTH0_AUDIENCE=https://api.orderpro.internal/local-delivery/staging
ORDERPRO_AUTH0_CLIENT_ID=<storefront-staging-client-id>
ORDERPRO_AUTH0_CLIENT_SECRET=<storefront-backend-secret-manager-only>
ORDERPRO_AUTH0_SCOPES=local-delivery:holds local-delivery:quote
ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false
```

Do not commit a real Client ID/Secret pair, paste a Client Secret into chat, store an access token in `.env`, or expose any of those values in logs. The token endpoint is derived from the canonical issuer and is not separately configurable.

## Safe certification

Load the variables into the current terminal through an approved secret manager, then opt into the isolated live test:

```powershell
$env:ORDERPRO_RUN_LIVE_M2M_TEST="true"
npm run test:orderpro:live
```

The test does not print the token or secret. It requires the exact STAGING response and rejects mismatched correlation IDs, scopes, client identity, environment or API status.

Without `ORDERPRO_RUN_LIVE_M2M_TEST=true`, the certification command exits with an error instead of reporting a false success. The normal unit and integration suite skips the live file and uses simulated Auth0 and OrderPRO responses.

## Implemented safeguards

- M2M is disabled unless `ORDERPRO_M2M_AUTH_MODE=AUTH0` exactly.
- STAGING API base URL, audience and Auth0 issuer are fixed to their approved values.
- Token lifetime cannot exceed 3,600 seconds.
- Returned scopes, when present, must be exactly `local-delivery:holds` and `local-delivery:quote`.
- Tokens are cached only in server memory with early renewal and single-flight acquisition.
- A `401` invalidates the token and retries once; `403` and `503` are not replayed.
- Requests use a generated UUID correlation ID, a five-second timeout, `cache: no-store`, and no redirects.
- Responses are size-limited, schema-validated, correlation-checked and reduced to sanitized errors.
- A sanitized observer can retain correlation ID, attempt, outcome, HTTP status and duration without receiving credentials or tokens.
- The existing checkout endpoint rejects Local Delivery while this release is dependency-blocked. Enabling it later requires both a code release and the server-side environment flag.

## Next release steps

1. Configure the storefront Client Secret in its server-side Vercel environment.
2. Run the live `auth-check` certification and retain only sanitized evidence.
3. Keep customer Local Delivery disabled while OrderPRO reports `DEPENDENCY_BLOCKED`.
4. After OrderPRO quote is released, add a storefront BFF for address/date/cart quote requests.
5. Persist a checkout attempt before acquiring an OrderPRO hold.
6. Add hold confirmation/release around the external Square order/payment decision.
