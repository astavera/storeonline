# VPS canary runbook

This runbook describes a private, non-indexable Storefront canary on the
confirmed Ubuntu VPS. It does not authorize a deployment by itself, and it
does not authorize payments, Square writes, Local Delivery, Shipping,
reservations, DNS cutover, or unrestricted customer traffic.

## Confirmed topology and credential boundaries

```text
Customer browser
  -> Caddy on storefront-public-gateway
    -> Storefront
      -> PostgreSQL on storefront-production-database
      -> orderpro-api:3000 on storefront-orderpro-private
        -> OrderPRO database on its own OrderPRO database network
```

Storefront, OrderPRO, PostgreSQL, and Caddy remain independently deployed.
Storefront never connects to the OrderPRO database, and OrderPRO never connects
to the Storefront database. The browser and Caddy never join
`storefront-orderpro-private`; `orderpro-api` never joins
`storefront-public-gateway` and never publishes a host port.

The shared PostgreSQL container may join isolated database networks, but its
Storefront database must expose two different least-privilege roles:

```text
storefront_runtime  -> storefront_prod application runtime only
storefront_migrator -> storefront_prod schema migrations only
OrderPRO role       -> OrderPRO database only
```

The two Storefront roles must have different passwords. Neither service may
receive the other role's URL or password.

## 1. Host preparation

Use the Docker Engine and Docker Compose plugin from Docker's official
repository. Allow inbound ports `22`, `80`, and `443` only; do not expose
application port `3000` or PostgreSQL port `5432` publicly.

Create independent Storefront directories outside the OrderPRO project:

```bash
sudo install -d -m 0750 /srv/storefront/releases
sudo install -d -m 0750 /srv/storefront/incoming
sudo install -d -m 0700 /srv/storefront/secrets
sudo install -d -m 0700 /srv/storefront/backups
```

`/srv/storefront/current` is reserved for an atomic symlink to the last
verified Storefront release. Do not create or change that symlink while a
candidate is being built, migrated, or verified.

Create the three external Docker networks once:

```bash
docker network create --driver bridge --internal storefront-production-database
docker network create --driver bridge --internal storefront-orderpro-private
docker network create --driver bridge storefront-public-gateway
```

The first two networks must report `Internal=true`; the public gateway must
report `Internal=false`. Stop if an existing network has the wrong value:

```bash
docker network inspect --format '{{.Name}}|internal={{.Internal}}|driver={{.Driver}}' \
  storefront-production-database storefront-orderpro-private storefront-public-gateway
```

In the independent PostgreSQL Compose project, attach PostgreSQL to
`storefront-production-database` with alias `storefront-postgres`. Attach only
`orderpro-api` to `storefront-orderpro-private` with alias `orderpro-api`.
Attach Caddy only to `storefront-public-gateway` for Storefront routing.

## 2. Create the two private environments

Use `infrastructure/production/env.runtime.example` for the Storefront runtime
and `infrastructure/production/env.migrator.example` for Prisma migrations.
Create them as two different regular files outside every release:

```text
/srv/storefront/secrets/storefront-runtime.env
/srv/storefront/secrets/storefront-migrator.env
```

Neither path may be a symbolic link. Both files must have mode `0600`. The
runtime file contains the application configuration and PostgreSQL URLs for
`storefront_runtime`. The migrator file contains only `DATABASE_URL` and
`DIRECT_URL`, both using `storefront_migrator`.

The local helper accepts separate target paths and separate PostgreSQL
passwords from an operator-managed input file:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-private-storefront-env.ps1 `
  -SourceEnvPaths <trusted-runtime-source-env> `
  -DatabaseEnvPath <trusted-database-password-source> `
  -RuntimeTargetPath <private-runtime-output> `
  -MigratorTargetPath <private-migrator-output>
```

The database password source accepts the canonical
`STOREFRONT_RUNTIME_DB_PASSWORD` and `STOREFRONT_MIGRATOR_DB_PASSWORD` names,
or the sealed role-split names `STOREFRONT_RUNTIME_PASSWORD` and
`STOREFRONT_MIGRATOR_PASSWORD`. Do not send passwords, private keys, tokens, or
environment files through chat or commit them to Git.

During preparation, the runtime environment must keep these values:

```dotenv
NEXT_PUBLIC_SITE_INDEXABLE=false
SQUARE_CHECKOUT_ENABLED=false
ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false
ORDERPRO_SHIPPING_CHECKOUT_ENABLED=false
ADMIN_DEV_BYPASS=false
ADMIN_IDENTITY_MODE=LEGACY_BOOTSTRAP
ADMIN_TRANSACTIONAL_NOTIFICATION_PROVIDER=DISABLED
OPERATIONS_ACCESS_SYNC_MODE=DISABLED
ALLOW_LOCAL_PERSISTENCE_FALLBACK=false
CUSTOMER_AUTH_DEV_PREVIEW=false
SHIPPO_TEST_MODE=true
NEXT_PUBLIC_SITE_URL=https://shop.srv1849559.hstgr.cloud
ADMIN_ALLOWED_ORIGINS=https://shop.srv1849559.hstgr.cloud
ORDERPRO_API_BASE_URL=http://orderpro-api:3000
```

Do not use `modernstate.com` in the active environment until its transfer, DNS
cutover, and final certificate gate are approved.

## 3. Package and stage an immutable candidate

GitHub is the source of truth. Package only a clean committed revision on the
trusted Windows workstation:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-storefront-release.ps1
```

Transfer the archive, checksum, and metadata to `/srv/storefront/incoming/`
using the established SCP procedure. The VPS does not run `git pull`.

Verify the checksum and extract into a new immutable release directory. Do not
overwrite an existing release and do not change `/srv/storefront/current`:

```bash
cd /srv/storefront/incoming
export STOREFRONT_COMMIT=<40-character-commit>
sha256sum --check "storefront-${STOREFRONT_COMMIT}.tar.gz.sha256"
sudo install -d -m 0750 /srv/storefront/releases/<40-character-commit>
sudo tar -xzf "storefront-${STOREFRONT_COMMIT}.tar.gz" \
  -C /srv/storefront/releases/<40-character-commit>
export CANDIDATE_RELEASE=/srv/storefront/releases/<40-character-commit>
cd "$CANDIDATE_RELEASE"
```

Export the two required private files and the full lowercase 40-character Git
commit. `STOREFRONT_IMAGE_TAG` has no `canary` or mutable fallback:

```bash
export STOREFRONT_RUNTIME_ENV_FILE=/srv/storefront/secrets/storefront-runtime.env
export STOREFRONT_MIGRATOR_ENV_FILE=/srv/storefront/secrets/storefront-migrator.env
export STOREFRONT_IMAGE_TAG="$STOREFRONT_COMMIT"
chmod +x infrastructure/production/*.sh
```

## 4. Preflight the candidate

Run preflight from the candidate before building or migrating. It validates
both credential boundaries without printing secret values:

```bash
cd "$CANDIDATE_RELEASE"
infrastructure/production/preflight.sh \
  "$STOREFRONT_RUNTIME_ENV_FILE" \
  "$STOREFRONT_MIGRATOR_ENV_FILE"
```

Resolve every failure. A passing preflight confirms only that the host,
networks, fail-closed flags, immutable tag, environment files, PostgreSQL roles,
and Compose wiring meet this contract.

## 5. Backup before migration

Pre-pull and approve the exact helper image used for media backup:

```bash
docker pull alpine:3.22
```

Create and verify PostgreSQL and Admin-media backups from the candidate:

```bash
cd "$CANDIDATE_RELEASE"
POSTGRES_CONTAINER=CHANGE_ME \
POSTGRES_DATABASE=storefront_prod \
BACKUP_ROOT=/srv/storefront/backups \
infrastructure/production/backup-storefront.sh
```

Copy the timestamped backup to encrypted off-host storage before continuing.
Do not rely on it until a restore has been rehearsed against disposable
PostgreSQL and media targets.

## 6. Build, migrate explicitly, and start the canary

Build from the candidate directory with the immutable commit tag:

```bash
cd "$CANDIDATE_RELEASE"
docker compose \
  --env-file "$STOREFRONT_RUNTIME_ENV_FILE" \
  -f infrastructure/production/compose.yml \
  build
```

Review the migration and verified backup. Migrations are never an automatic
dependency of Storefront startup; run the one-shot migrator explicitly:

```bash
docker compose \
  --env-file "$STOREFRONT_RUNTIME_ENV_FILE" \
  -f infrastructure/production/compose.yml \
  run --rm migrate
```

The Admin release adds the identity foundation and customer privacy workflow
migrations. Confirm both are present in `prisma migrate status`. Before the
runtime starts, rerun the credential-free ACL bootstrap and its read-only
verifier exactly as documented in `docs/postgres-role-bootstrap.md`; the
verifier must return `storefront_role_acl_verified`. Then activate the first
MFA-protected Owner through the bootstrap path and schedule a separate
configuration change to `ADMIN_IDENTITY_MODE=DATABASE`; do not leave legacy
bootstrap enabled after successful activation.

Only after the migration succeeds, start Storefront without rebuilding:

```bash
docker compose \
  --env-file "$STOREFRONT_RUNTIME_ENV_FILE" \
  -f infrastructure/production/compose.yml \
  up -d --no-build storefront
```

Inspect `docker compose ps`, the health check, and Storefront logs. Logs must
not contain tokens, authorization headers, database URLs, customer addresses,
or payment details.

## 7. Verify the canary before promotion

The temporary Caddy route is defined in
`infrastructure/production/caddy/storefront-canary.Caddyfile.example`. Manage it
only through the independent Caddy project and keep Caddy solely on
`storefront-public-gateway`.

After HTTPS routes to the candidate, complete the read-only checks:

```bash
cd "$CANDIDATE_RELEASE"
infrastructure/production/smoke-canary.sh https://shop.srv1849559.hstgr.cloud
```

Require a healthy database, released sync leases, fresh inventory, mapped
stores, and reviewed `PUBLISHED` merchandising. Manually verify desktop and
mobile navigation, Admin login, media persistence, cart behavior, pickup
availability, and accessibility. Payments and every write/fulfillment gate
remain disabled.

Also verify Users & Roles, MFA login and logout revocation, permission-filtered
navigation, Customers privacy export/request review, Audit CSV redaction,
Navigation & SEO draft/publication, Media persistence, Analytics partial-state
labels, Integration health, and failed-webhook requeue. Operations access and
notification sending must continue to show unavailable while their explicit
provider switches remain disabled.

Do not load `modernstate-final.Caddyfile.example` yet. The OrderPRO operations
UI must use its own public gateway upstream; never route
`operation.modernstate.com` to `orderpro-api`.

## 8. Promote only the verified release

Only after build, explicit migrations, container health, smoke checks, and the
manual canary verification all succeed may the release pointer change:

```bash
sudo ln -sfn "$CANDIDATE_RELEASE" /srv/storefront/current
test "$(readlink -f /srv/storefront/current)" = "$CANDIDATE_RELEASE"
```

Record the promoted commit and image tag. Never reuse a tag for a different
build.

## 9. Webhook worker

After promotion, configure the Square webhook signature key and
`WEBHOOK_WORKER_SECRET` before installing the timer. Copy the units to
`/etc/systemd/system`, reload systemd, and enable the timer:

```bash
cd /srv/storefront/current
sudo cp infrastructure/production/systemd/storefront-webhook-worker.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now storefront-webhook-worker.timer
sudo systemctl status storefront-webhook-worker.timer
```

Review failed webhook jobs and dead-letter events before enabling payments.

## 10. Rollback

For an application rollback, select a previously verified release and its
recorded immutable tag. Point `/srv/storefront/current` back to that release,
export both service-specific environment paths, and recreate only Storefront
with `--no-build`. Do not run the migrator as part of an application rollback.
Do not restart, deploy, or roll back OrderPRO or PostgreSQL. Keep checkout and
indexing switches disabled.

Never run `docker compose down -v`; it would remove persistent media. Database
restores require a separate approved maintenance window, an isolated current
state backup, and a rehearsed restore procedure. A failed application rollout
does not automatically justify reversing a database migration.

## 11. Final domain cutover

After the domain transfer and canary approval:

1. Prepare `A`/`AAAA` records for `modernstate.com` and `www` without changing
   them until the maintenance window.
2. Change the Storefront environment to `https://modernstate.com` and build a
   new immutable image because `NEXT_PUBLIC_SITE_URL` is a build-time value.
3. Activate `modernstate-final.Caddyfile.example` and validate Caddy.
4. Confirm `www.modernstate.com` redirects to `https://modernstate.com`.
5. Keep `NEXT_PUBLIC_SITE_INDEXABLE=false` until canonical URLs, robots,
   sitemap, HTTPS, and content are verified on the final domain.
6. Configure `operation.modernstate.com` through the independent OrderPRO
   operations deployment, never through the private OrderPRO API network.

## 12. Promotion gates

Promote beyond private canary only after repository CI passes, backup and
restore rehearsals succeed, catalog orderability is published, Square Sandbox
payments and webhooks are certified, and the selected fulfillment method
passes its complete OrderPRO hold/confirm/release canary. Enable one
customer-impacting switch at a time.
