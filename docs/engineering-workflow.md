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
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storeonline npm run prisma:validate
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storeonline npm run prisma:generate
```

Use `npm run prisma:migrate:dev` only against a disposable local database. Production and CI may use `prisma:migrate:deploy` only after a reviewed migration baseline exists.

## Current, visible technical debt

The initial ESLint migration has a recorded baseline of 51 warnings for image optimization, effect-state, hook dependency, unused-code, and image-alt findings. The default lint command enforces that budget, so new work cannot raise the total. Reduce the baseline section by section; `npm run lint:strict` must pass before the soft launch gate.

The repository does not yet contain a Prisma migration history. Creating and reviewing the initial migration belongs to Phase 1 before any shared database deployment.

Admin authentication is intentionally scheduled near launch. Until it is implemented and verified, `/admin` and `/api/admin/*` must not be exposed to untrusted users; use only local development or an access-controlled preview.
