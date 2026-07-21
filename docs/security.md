# Security

## Core rules

- No Square access tokens, webhook secrets, carrier keys, Auth0 Client Secrets, OrderPRO bearer tokens, or admin secrets may be exposed to the frontend.
- No raw card data is collected or stored.
- Checkout is validation-only. It does not accept payment tokens, create Square orders, or capture payments.
- Backend revalidates price, inventory, fulfillment mode, delivery fee, shipping rate, taxes, and slot capacity.
- The browser never calls Auth0 or OrderPRO directly. The server-only OrderPRO client acquires short-lived Client Credentials tokens, caches them only in memory, and sends them only in the `Authorization` header.
- Admin mutations require RBAC, CSRF protection, secure cookies, rate limiting, validation, and audit logging.

## Headers

`next.config.mjs` defines first-pass security headers:

- CSP compatible with Square Web Payments SDK.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: SAMEORIGIN` so the same-origin admin preview can render the storefront.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Payment and geolocation permissions are scoped.

## Webhooks

Square webhooks use raw request body text and HMAC signature verification in `src/server/square/webhook-signature.ts`. A valid event is persisted in `WebhookInboxEvent` before the endpoint returns `202`; `(provider, eventId)` is unique and processing failures are retained for bounded retries and dead-letter handling.

## Admin containment

`/admin` and `/api/admin/*` are fail-closed. The shared guard validates the signed `modern_state_admin` cookie, expiry, audience, declared capability, and same-origin `Origin`/`Host` for every mutation. The cookie payload contains `sub`, `capabilities`, `exp`, and `aud=modern-state-admin`; its HMAC secret must contain at least 32 random bytes. The login endpoint issues an eight-hour cookie with `HttpOnly`, `Secure` in production, and `SameSite=Strict`.

Production login requires `ADMIN_LOGIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`. Generate the password hash with `npm run admin:hash-password -- "a-long-password"`; escape each `$` as `\$` when copying the result into a local `.env` file. Failed login attempts are limited to five per email and client address every fifteen minutes; correct credentials can authenticate without extending a failed-attempt lockout. Invalid credentials use constant-work password verification, and logout expires the signed cookie. `ADMIN_DEV_BYPASS=true` remains a loopback-only development escape hatch and must never be enabled in preview or production. Uploads require `admin:media:write`, reject SVG, validate extension/MIME/file signature, use server-generated names and exclusive writes, and pass through the central rate-limiter interface.

## Persistence policy

PostgreSQL is required outside development. JSON persistence is available only when `ALLOW_LOCAL_PERSISTENCE_FALLBACK=true` and `NODE_ENV=development`; production database failures return an explicit error and never report a successful local save.

## Data minimization

Delivery staff should not see payment details. Warehouse staff should not see card/payment tokens. Logs must exclude tokens, authorization headers, card-related data, and sensitive customer fields unless specifically required and redacted.

## Remaining owner/platform work

- Select and integrate the production identity provider, MFA policy, session issuer, and capability-to-role mapping.
- Replace the in-memory admin rate-limiter adapter with a shared deployment-store adapter before horizontal scaling.
- Run the durable webhook processing worker and operational dead-letter alerts.
- Add rate limiting for public checkout, cart, search, and webhook ingress.
- Add Sentry filtering for sensitive data.
- Add dependency and secret scanning to CI.
