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

## Launch checks

- Run unit, integration, and Playwright tests.
- Verify Square Sandbox checkout.
- Verify webhook signature validation and replay protection.
- Verify old URL redirects.
- Verify security headers.
- Verify no secrets in frontend bundle.
- Verify mobile navigation and checkout accessibility.
