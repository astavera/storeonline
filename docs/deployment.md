# Deployment

The current application is a scaffold and must not receive unrestricted production traffic. Environment ownership and isolation are defined in [environments.md](environments.md).

## Toolchain gate

```bash
nvm use
npm ci
npm run check
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/storeonline_ci DIRECT_URL=postgresql://ci:ci@127.0.0.1:5432/storeonline_ci npm run prisma:validate
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/storeonline_ci DIRECT_URL=postgresql://ci:ci@127.0.0.1:5432/storeonline_ci npm run prisma:generate
npm run build
```

All three GitHub checks documented in [engineering-workflow.md](engineering-workflow.md) must pass before promotion.

## Production environment

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SITE_INDEXABLE=false` until the final public launch approval
- `SQUARE_ENVIRONMENT`
- `SQUARE_ALLOW_PRODUCTION_READONLY_SYNC`
- `SQUARE_CHECKOUT_ENABLED=true` only in the approved checkout environment
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_APPLICATION_ID`
- `NEXT_PUBLIC_SQUARE_APPLICATION_ID`
- `NEXT_PUBLIC_SQUARE_LOCATION_ID`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `WEBHOOK_WORKER_SECRET`
- `SHIPPO_API_TOKEN`
- `MAPBOX_ACCESS_TOKEN`
- `SENTRY_DSN`
- `ADMIN_SESSION_SECRET`
- `ADMIN_ALLOWED_ORIGINS`

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

- Verify `npx prisma migrate status` reports the shared database up to date.
- Run `npm run audit:constraints` and require zero violations, zero missing
  constraints, and every listed constraint validated.
- Run `npm run sync:square:postgres:readonly -- --status` and require released
  catalog/inventory leases, no last error, fresh inventory, and all operational
  stores mapped.
- Run `npm run sync:square:postgres:readonly -- --checkout-readiness`. A DRAFT
  can be audited, but unrestricted storefront traffic requires reviewed
  PUBLISHED merchandising content.
- Run lint, typecheck, unit, integration, build, and Playwright gates.
- Verify checkout remains `validation_only` unless a separately approved payment rollout is active.
- Verify webhook signature validation and replay protection.
- Verify old URL redirects.
- Verify security headers.
- Verify no secrets in frontend bundle.
- Run the isolated OrderPRO `auth-check` certification and confirm the access token, Client Secret and Authorization header are absent from logs and build artifacts.
- Confirm `ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false` until quote, slots and holds pass their separate release review.
- Confirm `/api/checkout` returns `local_delivery_not_available` for Local Delivery throughout this handshake-only release.
- Verify mobile navigation and checkout accessibility.
- Confirm `/robots.txt` blocks all crawlers before launch. Set
  `NEXT_PUBLIC_SITE_INDEXABLE=true` only after the production domain, canonical
  URLs, published content, and launch approval are complete; then verify
  `/robots.txt` and `/sitemap.xml` on the deployed domain.
- Confirm `/admin` and `/api/admin/*` have a configured identity issuer; the
  current containment layer fails closed when no production identity is available.
- Configure scheduled authenticated calls to `/api/internal/square/catalog-sync`
  and `/api/internal/webhooks/process` with `WEBHOOK_WORKER_SECRET`.
