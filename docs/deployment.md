# Deployment

## Required environment

- `DATABASE_URL`
- `SQUARE_ENVIRONMENT`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_APPLICATION_ID`
- `NEXT_PUBLIC_SQUARE_APPLICATION_ID`
- `NEXT_PUBLIC_SQUARE_LOCATION_ID`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SHIPPO_API_TOKEN`
- `MAPBOX_ACCESS_TOKEN`
- `SENTRY_DSN`
- `ADMIN_SESSION_SECRET`

OrderPRO STAGING uses these server-only variables. Keep checkout disabled while OrderPRO reports `DEPENDENCY_BLOCKED`:

- `ORDERPRO_M2M_AUTH_MODE`
- `ORDERPRO_INTEGRATION_ENVIRONMENT`
- `ORDERPRO_API_BASE_URL`
- `ORDERPRO_AUTH0_ISSUER`
- `ORDERPRO_AUTH0_AUDIENCE`
- `ORDERPRO_AUTH0_CLIENT_ID`
- `ORDERPRO_AUTH0_CLIENT_SECRET`
- `ORDERPRO_AUTH0_SCOPES`
- `ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false`

## Launch checks

- Run unit, integration, and Playwright tests.
- Verify Square Sandbox checkout.
- Verify webhook signature validation and replay protection.
- Verify old URL redirects.
- Verify security headers.
- Verify no secrets in frontend bundle.
- Run the isolated OrderPRO `auth-check` certification and confirm the access token, Client Secret and Authorization header are absent from logs and build artifacts.
- Confirm `ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false` until quote, slots and holds pass their separate release review.
- Confirm `/api/checkout` returns `local_delivery_not_available` for Local Delivery throughout this handshake-only release.
- Verify mobile navigation and checkout accessibility.
