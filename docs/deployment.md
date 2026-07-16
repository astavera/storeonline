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
- `SQUARE_ENVIRONMENT`
- `SQUARE_ALLOW_PRODUCTION_READONLY_SYNC`
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
- Verify mobile navigation and checkout accessibility.
- Confirm `/admin` and `/api/admin/*` have a configured identity issuer; the
  current containment layer fails closed when no production identity is available.
- Configure scheduled authenticated calls to `/api/internal/square/catalog-sync`
  and `/api/internal/webhooks/process` with `WEBHOOK_WORKER_SECRET`.
