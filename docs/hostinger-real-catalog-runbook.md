# Hostinger real-catalog preview

This runbook covers the smallest safe path for a Hostinger Node.js Web App to
show the real Square catalog without placing Square credentials in Hostinger or
in a browser bundle. It is an authenticated preview path. It does not enable
checkout, payments, refunds, shipping, Local Delivery, customer email, or
search-engine indexing.

## The one supported data path

```text
Square Production
  -> read-only sync process on the VPS (Square token exists here only)
    -> one authoritative Supabase PostgreSQL project
      -> Hostinger Next.js server (storefront_runtime database role)
        -> customer/admin browser
```

OrderPRO is not part of a catalog read. It remains a separate VPS service for
fulfillment, capacity, reservations, and operations. A later transactional
release may let the Hostinger server call a narrow OrderPRO HTTPS API with
server-to-server authentication. The browser must never call OrderPRO directly.

Do not open VPS PostgreSQL port `5432` to make Hostinger reach the existing
Docker database. The current Storefront uses Prisma and expects PostgreSQL, so
an externally reachable Supabase pooler is the minimal path. Replacing
Supabase with VPS PostgreSQL would first require a separately authenticated
catalog API or a managed private tunnel; that is not a configuration-only
change.

## Credential boundary

| Place | May contain | Must not contain |
| --- | --- | --- |
| Hostinger Web App | `storefront_runtime` URLs, admin email/hash/session secret | Square token, Square sync flag, migrator credential, VPS sync credential, OrderPRO shared secrets |
| VPS Square sync | `storefront_sync` URL, Square production read token, read-only sync flag | Hostinger admin session secret, checkout enablement |
| Migration job | `storefront_migrator` URL | Square token, runtime password |
| Browser | `NEXT_PUBLIC_*` non-secret values only | Any database URL, token, password, hash, or shared secret |

Use a separate random password for each database role. The Supabase `postgres`
owner credential is not an application credential and must not be installed in
Hostinger. For Supavisor, the pooler username is
`ROLE_NAME.PROJECT_REF`; percent-encode special characters in URL passwords.

## 1. Choose one authoritative PostgreSQL database

Before changing Hostinger, confirm the exact Supabase project that will remain
the production catalog database. Do not point Hostinger at Supabase while the
VPS sync writes to the local Docker `storefront_prod` database; the two copies
will immediately drift.

The Supabase project must be active and the operator must be an owner or have
the database privileges required to restore it, manage roles, and run
migrations. If the dashboard reports that the account cannot restore the
project, stop. Either the organization owner must restore/grant access, or a
new project must be created and the schema plus data migrated deliberately.

Required database identities:

- `storefront_runtime`: only application reads and the exact preview mutations
  permitted by the route allowlist (for example, homepage CMS state and cart
  persistence; never schema changes or Square synchronization).
- `storefront_sync`: only the tables/sequences required by the Square catalog,
  inventory, sync-state, and reviewed location reconciliation code.
- `storefront_migrator`: schema migration authority, used only by a one-shot
  operator job.

The repository currently does not contain a Supabase-specific, reviewed ACL
provisioning migration for these three roles. Do not approximate grants from
chat. Capture and review the exact grants before installing the credentials.

## 2. Bring the schema up to the release

Use the immutable Storefront commit intended for Hostinger. From a private
migration environment on the VPS or another trusted operator host:

```bash
npm ci
npm run prisma:migrate:deploy
npm run audit:constraints
```

The migration job uses `storefront_migrator`; Hostinger never runs migrations.
Do not use `prisma db push` and do not place the migrator URL in the Hostinger
environment.

## 3. Prove or refresh the real Square projection on the VPS

Create a populated copy of
`infrastructure/hostinger/env.vps-square-sync.example` outside every release,
owned by root with mode `0600`. Use the same immutable Storefront source as the
Hostinger deployment.

Run the configuration and mapping audits first:

```bash
npm run sync:square:postgres:readonly -- --check
npm run sync:square:postgres:readonly -- --locations
```

If location mappings are already exact, do not reapply them. If they are not,
review the audit before using the repository's exact confirmation command.
Then run the read-only Square import and verify its persisted evidence:

```bash
npm run sync:square:postgres:readonly
npm run sync:square:postgres:readonly -- --status
```

These commands read Square and write the PostgreSQL projection; they do not
write to Square and do not create orders or payments. The first import is large
and belongs in the VPS job, not in an HTTP request or Hostinger build.

Require all of the following before Hostinger uses the database:

- one completed `production` catalog sync state, released lock, and no error;
- one completed `production:inventory` state, released lock, and no error;
- RFC 3339 watermarks and ordered start/watermark/completion timestamps;
- catalog completion no older than `SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS`
  (`86400`, or 24 hours, by default);
- inventory completion no older than `SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS`
  (`1800`, or 30 minutes, by default);
- nonzero active item and variation counts;
- every operational store mapped to its reviewed Square location;
- no Sandbox sync state mixed into the same projection.

Do not use `--checkout-readiness` to certify this catalog-only preview. That
audit intentionally requires published merchandising and checkout-eligible
inventory, so it can fail correctly before any products have been reviewed or
published. Run it later as a separate launch gate before enabling checkout.

Syncing does not publish products. Square data lands in the internal catalog
inbox. Public product grids remain empty until reviewed website merchandising
is explicitly published. The authenticated admin preview may inspect and place
real products while every commerce gate remains off.

Product reads include inventory quantities, so they require both the fresh
catalog state and the stricter fresh inventory state. When either maximum age
is exceeded, reads fail closed instead of showing old quantities. With the
manual procedure in this runbook, rerun the VPS sync before those windows
expire; do not increase either value beyond the enforced 86400-second ceiling.

## 4. Configure Hostinger without Square credentials

In Hostinger hPanel, open the Node.js Web App, then use **Settings & Redeploy**
and import a populated private copy of
`infrastructure/hostinger/env.admin-preview.example`.

Do not accept an automatically installed database URL until its username has
been checked. Hostinger's Supabase connection wizard is convenient, but a URL
using `postgres.PROJECT_REF` carries the Supabase owner credential and violates
this preview's least-privilege contract. Replace it with the reviewed
`storefront_runtime.PROJECT_REF` URLs.

Important details:

1. Use Node.js `24.x`, the repository root, and the `main` release commit.
2. Use the Supabase transaction pooler (`6543`, `pgbouncer=true`) for
   `DATABASE_URL` and the session pooler (`5432`) for `DIRECT_URL`; both use the
   least-privilege `storefront_runtime` role.
3. Set the current HTTPS Hostinger origin in both `NEXT_PUBLIC_SITE_URL` and
   `ADMIN_ALLOWED_ORIGINS`.
4. Generate the admin hash with `npm run admin:hash-password -- "..."` on a
   trusted local machine. Do not paste the plaintext password into logs or Git.
5. Keep `SQUARE_ENVIRONMENT=production` so reads require production sync
   evidence, but keep `SQUARE_ALLOW_PRODUCTION_READONLY_SYNC=false` and leave
   every Square credential blank.
6. Redeploy after changing environment variables; Hostinger applies them to a
   new deployment rather than the already running process.

Hostinger officially supports Next.js Node.js apps, environment variables, and
an external Supabase connection. The application still owns its Prisma schema
and migration process; Hostinger's connection wizard does not modify code or
grant least-privilege database roles.

## 5. Verify the Hostinger preview

Verify without enabling any integration:

1. An unauthenticated `/admin` request redirects to `/admin/login`.
2. The configured admin can sign in and open `/admin/homepage`.
3. Catalog choices show Square item/variation identities and no `seed-*` or E2E
   fixture identities.
4. A database failure shows an unavailable/empty state instead of fixtures.
5. Customer checkout, Square sync, refunds, shipping, Local Delivery, email,
   and OrderPRO mutations remain blocked.
6. `/robots.txt` blocks indexing and the canonical URL uses the temporary
   Hostinger hostname until the final domain cutover.

Do not use `/api/health` alone to certify the catalog; that endpoint only proves
the Next.js process is alive. The VPS status command is the source of sync
freshness evidence.

## Missing automation before continuous freshness

The repository has the sync CLI, but this external-Hostinger topology does not
yet have a production, immutable VPS runner and systemd service/timer that run
the CLI directly with the VPS-only credential file. The existing HTTP catalog
worker expects the Storefront runtime to hold the Square token, which this
topology intentionally forbids.

Until a dedicated runner is reviewed and versioned, refresh the catalog only
through the explicit VPS CLI procedure above. Do not schedule unauthenticated
HTTP calls, expose a token to Hostinger, or copy a populated environment file
into a release directory.

## Platform references

- [Hostinger: connect a Supabase database to a Node.js app](https://www.hostinger.com/support/connecting-a-supabase-database-to-a-hostinger-node-js-application/)
- [Hostinger: add deployment environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Supabase: Prisma connection guidance](https://supabase.com/docs/guides/database/prisma)
- [Supabase: Postgres roles and per-service users](https://supabase.com/docs/guides/database/postgres/roles)
- [Supabase: direct and pooled Postgres connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
