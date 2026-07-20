# Security

## Core rules

- No Square access tokens, webhook secrets, carrier keys, Auth0 Client Secrets, OrderPRO bearer tokens, or admin secrets may be exposed to the frontend.
- No raw card data is collected or stored.
- Square Web Payments SDK tokenizes cards in the browser and sends single-use tokens to the backend.
- Backend revalidates price, inventory, fulfillment mode, delivery fee, shipping rate, taxes, and slot capacity.
- The browser never calls Auth0 or OrderPRO directly. The server-only OrderPRO client acquires short-lived Client Credentials tokens, caches them only in memory, and sends them only in the `Authorization` header.
- Admin mutations require RBAC, CSRF protection, secure cookies, rate limiting, validation, and audit logging.

## Headers

`next.config.mjs` defines first-pass security headers:

- CSP compatible with Square Web Payments SDK.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Payment and geolocation permissions are scoped.

## Webhooks

Square webhooks use raw request body text and HMAC signature verification in `src/server/square/webhook-signature.ts`. Webhook event IDs must be persisted before processing to block replay.

## Data minimization

Delivery staff should not see payment details. Warehouse staff should not see card/payment tokens. Logs must exclude tokens, authorization headers, card-related data, and sensitive customer fields unless specifically required and redacted.

## Remaining work

- Add admin auth and RBAC.
- Add CSRF protection for mutations.
- Add rate limiting for login, checkout, cart, search, and webhooks.
- Add Sentry filtering for sensitive data.
- Add dependency and secret scanning to CI.
