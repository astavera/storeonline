# Modern State - State News NYC Ecommerce

Next.js ecommerce scaffold for Modern State, the evolution of State News on NYC's Upper East Side.

## First milestone status

- App Router, TypeScript, Tailwind, design tokens, route tree, admin shell, checkout shell, and tests are scaffolded.
- Square is server-only by design. No production writes are implemented.
- Website departments are independent from Square categories and `reporting_category`.
- Candy & Snacks is preserved as legacy/search/SEO context, not a main department.
- The Phase 1 Prisma baseline has been applied and smoke-tested on disposable PostgreSQL 17; no shared database was changed.
- This is not yet a production-ready transactional store. Payments, durable orders, shared database provisioning, fulfillment, and admin authentication remain incomplete.

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
DATABASE_URL=postgresql://local:local@127.0.0.1:5432/storeonline npm run prisma:validate
DATABASE_URL=postgresql://local:local@127.0.0.1:5432/storeonline npm run prisma:generate
npm run build
```

For browser tests, install Chromium once and then run Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```

GitHub Actions repeats these checks on Node 24 and tests Playwright against the production server.

## Working agreements

- [Engineering workflow](docs/engineering-workflow.md)
- [Environments and configuration](docs/environments.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Security](docs/security.md)

Admin authentication is intentionally deferred to the later security phase. Until then, do not expose `/admin` or `/api/admin/*` to untrusted users.
