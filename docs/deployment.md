# Deployment

The current application is a scaffold and must not receive unrestricted production traffic. Environment ownership and isolation are defined in [environments.md](environments.md).

## Toolchain gate

```bash
nvm use
npm ci
npm run check
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/storeonline_ci npm run prisma:validate
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/storeonline_ci npm run prisma:generate
npm run build
```

All three GitHub checks documented in [engineering-workflow.md](engineering-workflow.md) must pass before promotion.

## Production environment

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
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

- The Phase 1 Prisma baseline has passed a disposable PostgreSQL 17 application
  test. Before running `prisma migrate deploy` against a shared environment,
  review the exact SQL, backup policy, and rollback plan for that environment.
- Run lint, typecheck, unit, integration, build, and Playwright gates.
- Verify Square Sandbox checkout.
- Verify webhook signature validation and replay protection.
- Verify old URL redirects.
- Verify security headers.
- Verify no secrets in frontend bundle.
- Verify mobile navigation and checkout accessibility.
- Confirm `/admin` and `/api/admin/*` are authenticated and authorized before removing deployment-platform access control.
