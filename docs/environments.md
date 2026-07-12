# Environments and configuration

## Environment policy

| Environment | Purpose | Data and integrations |
| --- | --- | --- |
| Local | Feature development and unit tests | Local or disposable PostgreSQL; Square Sandbox only |
| CI | Static checks, build, and automated tests | Syntactically valid dummy database URL for Prisma commands; no production credentials |
| Preview | Pull-request acceptance | Isolated preview database when needed; Square Sandbox; access-controlled admin |
| Production | Customer traffic | Managed PostgreSQL, production Square account, monitored webhooks, and reviewed secrets |

Never reuse production tokens in local, CI, or preview environments. Variables prefixed with `NEXT_PUBLIC_` are shipped to the browser and cannot contain secrets.

## Variable ownership

### Application

- `NEXT_PUBLIC_SITE_URL`: canonical URL for metadata and webhook URL construction.
- `DATABASE_URL`: PostgreSQL connection string. Required for Prisma commands and database-backed runtime behavior.

### Square

- `SQUARE_ENVIRONMENT`: `sandbox` outside production; `production` only after the launch gate.
- `SQUARE_ACCESS_TOKEN`: server-only API credential.
- `SQUARE_APPLICATION_ID`: server-side application identifier.
- `NEXT_PUBLIC_SQUARE_APPLICATION_ID`: browser-visible Web Payments application identifier.
- `NEXT_PUBLIC_SQUARE_LOCATION_ID`: browser-visible Square location identifier.
- `SQUARE_WEBHOOK_SIGNATURE_KEY`: server-only webhook verification secret.

### Other integrations

- `SHIPPO_API_TOKEN`: server-only shipping credential.
- `MAPBOX_ACCESS_TOKEN`: map token; restrict it by origin and API scope.
- `SENTRY_DSN`: error reporting destination.
- `ADMIN_SESSION_SECRET`: reserved for the admin authentication phase; do not treat its presence as authentication.

## Local setup

Copy `.env.example` to `.env` and replace placeholders with local or sandbox values. `.env` files are ignored by Git and must never be committed.

The application currently supports demo fallbacks when integrations are absent. A successful fallback build does not certify payments, inventory, fulfillment, or admin security for production.

## CI behavior

CI supplies a dummy `DATABASE_URL` only to `prisma validate` and `prisma generate`; those commands do not connect to a database. Build and browser jobs run without integration credentials so they cannot write to external systems.

Production secrets must be stored in the deployment platform, scoped per environment, rotated when personnel or access changes, and excluded from logs and browser bundles.
