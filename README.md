# Modern State - State News NYC Ecommerce

Next.js ecommerce scaffold for Modern State, the evolution of State News on NYC's Upper East Side.

## First milestone status

- App Router, TypeScript, Tailwind, design tokens, route tree, admin shell, checkout shell, and tests are scaffolded.
- Square is server-only by design. Production catalog and inventory reads are
  supported behind an explicit kill switch; no Production Square writes are enabled.
- The OrderPRO STAGING M2M client is server-only and fail-closed. It can certify `auth-check`; walking quote, holds and checkout remain disabled.
- Website departments are independent from Square categories and `reporting_category`.
- Candy & Snacks is preserved as legacy/search/SEO context, not a main department.
- The six Phase 1 migrations are applied to the shared Supabase database and all
  24 operational constraints are present, validated, and violation-free.
- The two public stores are mapped to Square Production. Catalog and inventory
  are synchronized into PostgreSQL, and checkout validates price and stock at
  the selected store without creating an order or taking payment.
- This is not yet a production-ready transactional store. Payments, Square order
  creation, warehouse shipping, fulfillment business rules, worker scheduling,
  and the production admin identity provider remain incomplete.

## Prerequisites

- Node.js 24.18.0 LTS
- npm 11

The repository pins both through `.nvmrc`, `.node-version`, `package.json`, and `package-lock.json`.

## Run locally

```bash
nvm use
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Verify locally

```bash
npm run check
DATABASE_URL=postgresql://local:local@127.0.0.1:5432/storeonline DIRECT_URL=postgresql://local:local@127.0.0.1:5432/storeonline npm run prisma:validate
DATABASE_URL=postgresql://local:local@127.0.0.1:5432/storeonline DIRECT_URL=postgresql://local:local@127.0.0.1:5432/storeonline npm run prisma:generate
npm run build
```

For browser tests, install Chromium once and then run Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```

For a bounded Square catalog smoke test, place the matching Sandbox or production access token in ignored `.env.local`, set `SQUARE_ENVIRONMENT`, and run:

```bash
npm run test:square:catalog
```

For the PostgreSQL-backed Production read-only workflow, also set
`SQUARE_ALLOW_PRODUCTION_READONLY_SYNC=true` and use:

```bash
npm run sync:square:postgres:readonly -- --check
npm run sync:square:postgres:readonly -- --status
npm run sync:square:postgres:readonly -- --checkout-readiness
```

This command only lists locations and catalog items. It does not expose Square mutation methods. Never commit or paste an access token into terminal output, issues, or pull requests. See [the read-only audit](docs/square-readonly-audit.md) for the latest production findings.

GitHub Actions repeats these checks on Node 24 and tests Playwright against the production server.

## Working agreements

- [Master project roadmap](docs/MASTER_ROADMAP.md)
- [Current Phase 1 handoff](docs/phase-1-handoff.md)
- [Engineering workflow](docs/engineering-workflow.md)
- [Environments and configuration](docs/environments.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Security](docs/security.md)

Admin routes have a fail-closed credential login, signed secure sessions, origin
checks, capabilities, and shared rate limiting. Configure `ADMIN_LOGIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET` before exposing `/admin`.
