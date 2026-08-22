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
Require `sslmode=require&sslaccept=strict` in every Prisma Supabase URL and
enable **Enforce SSL on incoming connections** in the Supabase database SSL
settings before installing either application credential.

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

- `storefront_runtime`: `SELECT` only on the exact catalog, inventory, location,
  and published merchandising tables used by this preview, plus the narrow
  insert/column-update grant required for admin-login rate limiting. It cannot
  change catalog, CMS, cart, customer, order, or checkout data.
- `storefront_sync`: only the tables/sequences required by the Square catalog,
  inventory, sync-state, and reviewed location reconciliation code.
- `storefront_migrator`: schema migration authority, used only by a one-shot
  operator job.

Install and verify these roles only with the reviewed, credential-free SQL in
`infrastructure/postgres/bootstrap-storefront-roles.sql` and
`infrastructure/postgres/verify-storefront-roles.sql`. Follow
`docs/postgres-role-bootstrap.md` for the owner connection, private password
setup, post-migration rerun, verification, and recovery procedure. Do not add
ad hoc grants in the Supabase dashboard.

## 2. Bring the schema up to the release

Use the immutable Storefront commit intended for Hostinger. From a private
migration environment on the VPS or another trusted operator host:

```bash
npm ci
npm run prisma:migrate:deploy
npm run audit:constraints
npm run bootstrap:locations
npm run bootstrap:locations -- --apply --confirm modern-state-store-locations-v2
```

The migration job uses `storefront_migrator`; Hostinger never runs migrations.
Do not use `prisma db push` and do not place the migrator URL in the Hostinger
environment. The location bootstrap is also an operator action under the
migrator credential; the narrower `storefront_sync` role cannot create stores.
After migrations and the location bootstrap, rerun the ACL bootstrap and its
read-only verifier exactly as documented in `docs/postgres-role-bootstrap.md`.

## 3. Install the private Square projection runner on the VPS

Use the same immutable Storefront release that Hostinger runs. Build the
dedicated `square-sync` target on the VPS, give it the release directory name
as `STOREFRONT_RELEASE_ID`, and record the resulting local `sha256:` image ID.
Do not use `latest`, a mutable registry tag, or the normal web-server image.

```bash
release=/srv/storefront/releases/CHANGE_ME_IMMUTABLE_RELEASE
release_id="$(basename -- "$release")"
docker build --pull=false --target square-sync \
  --build-arg "STOREFRONT_RELEASE_ID=$release_id" \
  --tag "storefront/square-sync:$release_id" \
  "$release"
docker image inspect --format '{{.Id}}' "storefront/square-sync:$release_id"
```

Install these versioned files from that release:

| Repository file | Root-owned VPS target | Mode |
| --- | --- | --- |
| `infrastructure/hostinger/run-square-postgres-sync-v1.sh` | `/srv/storefront/operations/square-sync/run-square-postgres-sync-v1.sh` | `0755` |
| populated `infrastructure/hostinger/env.vps-square-sync.example` | `/srv/storefront/secrets/storefront-square-sync.env` | `0600` |
| populated `infrastructure/hostinger/current-release.example` | `/srv/storefront/operations/square-sync/current-release` | `0600` |
| `infrastructure/hostinger/systemd/storefront-square-postgres-sync.service` | `/etc/systemd/system/storefront-square-postgres-sync.service` | `0644` |
| `infrastructure/hostinger/systemd/storefront-square-postgres-sync.timer` | `/etc/systemd/system/storefront-square-postgres-sync.timer` | `0644` |

Create the operations directory before installing either root-owned control
file. This prevents an unprivileged pre-creation or symlink from becoming the
systemd execution path:

```bash
install -d -o root -g root -m 0750 \
  /srv/storefront/operations \
  /srv/storefront/operations/square-sync
```

The two-line `current-release` file must contain the exact immutable release
path and the exact local image ID. Never put a tag there. Create the populated
environment through a private root editor or secret-transfer procedure; do not
print its database password or Square token into a shell transcript.

The wrapper validates the release, image labels, entrypoint, secret metadata,
all disabled commerce gates, and a dedicated egress network. It then runs
three ephemeral containers in order: configuration check, direct Square read
and PostgreSQL projection write, and persisted-state verification. The
containers expose no ports, mount no host paths, and never write to Square.
The wrapper creates `storefront-square-sync-egress` on its first successful run
and refuses to share that network with another container.

After `systemctl daemon-reload`, start the service once and inspect its result
before enabling the timer:

```bash
systemctl start storefront-square-postgres-sync.service
systemctl status --no-pager storefront-square-postgres-sync.service
journalctl -u storefront-square-postgres-sync.service --since today --no-pager
systemctl enable --now storefront-square-postgres-sync.timer
systemctl list-timers storefront-square-postgres-sync.timer --no-pager
```

The timer runs every eight minutes with up to fifteen seconds of randomized delay,
comfortably inside the thirty-minute inventory freshness limit. A failed check,
sync, or status command makes the service fail visibly and does not publish
stale data as healthy.

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
versioned timer, investigate any failed unit before those windows expire; do
not increase either value beyond the enforced 86400-second ceiling.

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
   least-privilege `storefront_runtime` role and both require
   `sslmode=require&sslaccept=strict`.
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

## Operational boundary

The timer is the only supported continuous sync path for this topology. Do not
schedule unauthenticated HTTP calls, expose the Square token to Hostinger, copy
a populated environment into a release directory, or attach the sync container
to Storefront, OrderPRO, database, or public-gateway Docker networks.

## Platform references

- [Hostinger: connect a Supabase database to a Node.js app](https://www.hostinger.com/support/connecting-a-supabase-database-to-a-hostinger-node-js-application/)
- [Hostinger: add deployment environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Supabase: Prisma connection guidance](https://supabase.com/docs/guides/database/prisma)
- [Supabase: Postgres roles and per-service users](https://supabase.com/docs/guides/database/postgres/roles)
- [Supabase: direct and pooled Postgres connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
