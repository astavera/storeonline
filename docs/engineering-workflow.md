# Engineering workflow

## Canonical toolchain

- Node.js `24.18.0` LTS, declared in `.nvmrc` and `.node-version`.
- npm 11 with the committed `package-lock.json`.
- Exact direct dependency versions. Dependency updates arrive through reviewed Dependabot pull requests.
- Next.js 16 App Router, TypeScript strict mode, ESLint flat config, Vitest, Playwright, and Prisma.

Use `npm ci` for a clean installation. Do not replace the lockfile or run broad major-version upgrades inside feature work.

## Branch strategy

`main` is the only long-lived branch and must remain deployable. Work happens in short-lived branches:

- `feat/<scope>` for product work.
- `fix/<scope>` for defects.
- `chore/<scope>` for tooling and maintenance.
- `docs/<scope>` for documentation-only work.

Open a pull request before merging. Prefer small pull requests that change one section or one technical concern. Payment, order, inventory, fulfillment, database migration, and admin changes require an explicit rollback plan.

## Required GitHub checks

Protect `main` and require these status checks:

1. `Quality / static and unit`
2. `Quality / production build`
3. `Quality / browser`

Also require one approving review, dismissal of stale approvals after new commits, resolved conversations, and a branch up to date with `main`. Direct pushes and force pushes to `main` should be disabled.

The workflow runs lint, route-aware type generation, TypeScript, Vitest, Prisma validation and generation, a production dependency audit, a production build, and Playwright against `next start`.

## Local verification

```bash
nvm use
npm ci
npm run check
npm run build
```

When the Prisma schema changes:

```bash
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storeonline DIRECT_URL=postgresql://user:password@127.0.0.1:5432/storeonline npm run prisma:validate
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storeonline DIRECT_URL=postgresql://user:password@127.0.0.1:5432/storeonline npm run prisma:generate
```

Phase 1 establishes the reviewed PostgreSQL baseline at
`prisma/migrations/20260712180000_initial_schema/migration.sql`. Before using any
shared database, inspect that SQL and prove it against an empty, disposable local
PostgreSQL database:

```bash
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storeonline_phase1 DIRECT_URL=postgresql://user:password@127.0.0.1:5432/storeonline_phase1 npm run prisma:migrate:deploy
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storeonline_phase1 DIRECT_URL=postgresql://user:password@127.0.0.1:5432/storeonline_phase1 npx prisma migrate status
```

Use `npm run prisma:migrate:dev` only against a disposable local database. Once
the baseline has been applied to a shared environment, never rewrite it; create a
new migration for every later schema change.

## Current, visible technical debt

The initial ESLint migration has a recorded baseline of 51 warnings for image optimization, effect-state, hook dependency, unused-code, and image-alt findings. The default lint command enforces that budget, so new work cannot raise the total. Reduce the baseline section by section; `npm run lint:strict` must pass before the soft launch gate.

Prisma treats `categoryIds`, `fulfillmentModes`, `allowedLocationIds`, and
`activeDays` as required list fields, while PostgreSQL's generated array columns
still permit `NULL` in direct SQL. Runtime writes must go through Prisma and
validated services. Before operational or admin database writes are enabled, add
a reviewed follow-up migration with database-level defaults, nullability, and
positive/range checks for quantities, capacity, fees, dates, and slot times.

The Phase 1 Prisma baseline passed a clean application and transactional
read/write smoke test on disposable PostgreSQL 17.10 on 2026-07-12. The test
created 26 application tables, 8 enums, 25 foreign keys, and the manual
`SlotHold_exactly_one_owner_check`; the test data was rolled back. No shared
database was changed.

Runtime database access must use the shared client in `src/server/db/prisma.ts`.
Request handlers and services must not create and disconnect a new Prisma client
for each operation; serverless connection limits and the selected pooling
strategy remain part of the Phase 1 production database decision.

Admin authentication is intentionally scheduled near launch. Until it is implemented and verified, `/admin` and `/api/admin/*` must not be exposed to untrusted users; use only local development or an access-controlled preview.
