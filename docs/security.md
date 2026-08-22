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

`/admin` and `/api/admin/*` are fail-closed. Page routes have a domain-specific minimum permission and every mutation verifies same-origin `Origin`/`Host`. Database identity mode uses a random 256-bit opaque cookie token; only its SHA-256 hash is stored. Sessions require an active Store Admin role, enrolled and verified MFA, matching `authVersion`, a 30-minute idle window, an absolute expiry, and `HttpOnly`, `Secure` in production, `SameSite=Strict` cookie controls.

`ADMIN_IDENTITY_MODE=LEGACY_BOOTSTRAP` is a temporary first-owner migration path and emits the Owner permission set, never `admin:*`. `ADMIN_IDENTITY_MODE=DATABASE` rejects those legacy signed sessions and requires database credentials plus TOTP or a one-time recovery code. TOTP secrets use AES-256-GCM with a separate 32-byte base64url key; recovery codes use a separate HMAC pepper and are stored only as hashes. Failed login and activation attempts are rate limited. Logout revokes the database session before expiring the cookie. `ADMIN_DEV_BYPASS=true` remains loopback-only and must never be enabled in preview or production.

## Persistence policy

PostgreSQL is required outside development. JSON persistence is available only when `ALLOW_LOCAL_PERSISTENCE_FALLBACK=true` and `NODE_ENV=development`; production database failures return an explicit error and never report a successful local save.

## Data minimization

Delivery staff should not see payment details. Warehouse staff should not see card/payment tokens. Logs must exclude tokens, authorization headers, card-related data, and sensitive customer fields unless specifically required and redacted.

Audit CSV export is Owner-only, streamed, capped at 5,000 rows, protected
against spreadsheet formula injection, and redacts credentials, hashes and
customer PII from snapshots. Customer local-data export is separately guarded
by `customers:privacy.manage`, audited, private/no-store, and excludes sessions,
challenges, payments, internal notes and unmirrored external records.

Admin media uploads accept JPG, PNG, WEBP, or GIF up to 5 MB and verify file
signatures before writing a randomized filename. SVG and arbitrary code are
rejected. Media metadata may be hidden from the storefront; source-file
deletion is intentionally unavailable in Admin.

## Remaining owner/platform work

- Decide whether the database identity issuer remains primary or is federated to a production SSO provider; MFA, revocable sessions, role mapping, and location scopes are already enforced locally.
- Replace the in-memory admin rate-limiter adapter with a shared deployment-store adapter before horizontal scaling.
- Run the durable webhook processing worker and operational dead-letter alerts.
- Add rate limiting for public checkout, cart, search, and webhook ingress.
- Add Sentry filtering for sensitive data.
- Add dependency and secret scanning to CI.
