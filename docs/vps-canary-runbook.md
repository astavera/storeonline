# VPS canary runbook

This runbook prepares a private, non-indexable Storefront deployment on the
confirmed Hostinger VPS running Ubuntu 24.04.4 LTS. It does not authorize
Square payments, Local Delivery, Shipping, reservations, DNS cutover, or
unrestricted customer traffic.

## Confirmed topology and isolation

```text
Customer browser
  -> Caddy on storefront-public-gateway
    -> Storefront
      -> PostgreSQL on storefront-production-database
      -> orderpro-api:3000 on storefront-orderpro-private
        -> OrderPRO database on its own OrderPRO database network
```

Storefront, OrderPRO, PostgreSQL, and Caddy remain independently deployed.
Storefront never connects to the OrderPRO database. OrderPRO never connects to
the Storefront database. The browser and Caddy never join
`storefront-orderpro-private`; `orderpro-api` never joins
`storefront-public-gateway` and never publishes a host port.

The shared PostgreSQL container may join two isolated database networks, but it
must expose separate databases and roles:

```text
storefront_app -> storefront_prod only
OrderPRO role  -> OrderPRO database only
```

The remaining operator inputs are the actual PostgreSQL container name, the
OrderPRO database/network names, the Caddy project directory, and the encrypted
off-host backup destination. Do not send passwords, private keys, tokens, or
environment files through chat.

## 1. Host preparation

Use an Ubuntu or Debian LTS release with the Docker Engine and Docker Compose
plugin installed from Docker's official repository. Apply operating-system
updates first. Allow inbound ports `22`, `80`, and `443` only; restrict SSH by
operator IP when practical. Do not expose application port `3000` or PostgreSQL
port `5432` publicly.

Create independent Storefront directories. Do not place them below the
OrderPRO project:

```bash
sudo install -d -m 0750 /srv/storefront/releases
sudo install -d -m 0750 /srv/storefront/incoming
sudo install -d -m 0700 /srv/storefront/secrets
sudo install -d -m 0700 /srv/storefront/backups
```

`/srv/storefront/current` is an atomic symlink to one immutable Storefront
release. Store the private environment file at
`/srv/storefront/secrets/storefront.env` with mode `0600`. Never commit or copy
that file into a release archive or Docker image.

Create these three external Docker networks once:

```bash
docker network create storefront-production-database
docker network create storefront-orderpro-private
docker network create storefront-public-gateway
```

In the independent PostgreSQL Compose project, attach PostgreSQL to
`storefront-production-database` with alias `storefront-postgres`. In the
independent OrderPRO Compose project, attach only `orderpro-api` to
`storefront-orderpro-private` with alias `orderpro-api`. In the independent
Caddy project, attach Caddy only to `storefront-public-gateway` for Storefront
routing.

## 2. Safe canary environment

Start from `infrastructure/production/env.canary.example`. During this phase,
the following values must remain exactly as shown:

```dotenv
NEXT_PUBLIC_SITE_INDEXABLE=false
SQUARE_CHECKOUT_ENABLED=false
ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false
ORDERPRO_SHIPPING_CHECKOUT_ENABLED=false
ADMIN_DEV_BYPASS=false
ALLOW_LOCAL_PERSISTENCE_FALLBACK=false
CUSTOMER_AUTH_DEV_PREVIEW=false
SHIPPO_TEST_MODE=true
```

Generate secrets locally with a cryptographically secure generator. Configure
the temporary canary hostname consistently in `NEXT_PUBLIC_SITE_URL` and
`ADMIN_ALLOWED_ORIGINS`:

```dotenv
NEXT_PUBLIC_SITE_URL=https://shop.srv1849559.hstgr.cloud
ADMIN_ALLOWED_ORIGINS=https://shop.srv1849559.hstgr.cloud
ORDERPRO_API_BASE_URL=http://orderpro-api:3000
```

Do not use `modernstate.com` in the active environment until its transfer, DNS
cutover, and final certificate gate are approved.

## 3. Preflight

Run the read-only preflight before building or migrating:

```bash
cd /srv/storefront/current
chmod +x infrastructure/production/*.sh
infrastructure/production/preflight.sh /srv/storefront/secrets/storefront.env
```

Resolve every failure. A passing preflight does not make the site production
ready; it only confirms that the VPS and fail-closed configuration are shaped
correctly.

## 4. Backup before every migration

Pre-pull and approve the exact helper image used for media backup:

```bash
docker pull alpine:3.22
```

Then create and verify the PostgreSQL and Admin-media backups:

```bash
cd /srv/storefront/current
POSTGRES_CONTAINER=CHANGE_ME \
POSTGRES_DATABASE=storefront_prod \
BACKUP_ROOT=/srv/storefront/backups \
infrastructure/production/backup-storefront.sh
```

Copy the resulting timestamped directory to encrypted off-host storage before
continuing. Do not rely on a backup until a restore has been rehearsed against
a disposable PostgreSQL instance and temporary media volume.

## 5. Package and transfer an immutable release

GitHub is the source of truth. Package only a clean, committed revision on the
trusted Windows workstation:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-storefront-release.ps1
```

The command creates a Git archive, SHA-256 checksum, and metadata under
`output/releases`. Transfer those three files to the Storefront incoming
directory with SCP. The VPS does not run `git pull`:

```powershell
scp output/releases/storefront-<commit>.* <operator>@2.25.88.210:/srv/storefront/incoming/
```

On the VPS, verify the checksum and extract to a new release directory. Never
overwrite an existing release:

```bash
cd /srv/storefront/incoming
sha256sum --check storefront-<commit>.tar.gz.sha256
sudo install -d -m 0750 /srv/storefront/releases/<commit>
sudo tar -xzf storefront-<commit>.tar.gz -C /srv/storefront/releases/<commit>
sudo ln -sfn /srv/storefront/releases/<commit> /srv/storefront/current
```

Build with the reviewed commit as the immutable image tag:

```bash
cd /srv/storefront/current
export STOREFRONT_ENV_FILE=/srv/storefront/secrets/storefront.env
export STOREFRONT_IMAGE_TAG=<commit>
docker compose \
  --env-file "$STOREFRONT_ENV_FILE" \
  -f infrastructure/production/compose.yml \
  build
```

Record the previous image tag before deployment. Never reuse a tag for a
different build.

## 6. Migrate and start the private canary

Only after backup verification and migration review:

```bash
cd /srv/storefront/current
docker compose \
  --env-file "$STOREFRONT_ENV_FILE" \
  -f infrastructure/production/compose.yml \
  run --rm migrate

docker compose \
  --env-file "$STOREFRONT_ENV_FILE" \
  -f infrastructure/production/compose.yml \
  up -d --no-build storefront
```

Inspect `docker compose ps` and the Storefront logs. Logs must not contain
tokens, authorization headers, database URLs, customer addresses, or payment
details.

## 7. Read-only verification

Once the HTTPS proxy routes the private canary domain:

```bash
infrastructure/production/smoke-canary.sh https://shop.srv1849559.hstgr.cloud
npm run audit:constraints
npm run sync:square:postgres:readonly -- --status
npm run sync:square:postgres:readonly -- --checkout-readiness
```

Require a healthy database, released sync leases, fresh inventory, mapped
stores, and reviewed `PUBLISHED` merchandising. Manually verify desktop and
mobile navigation, Admin login, media persistence, cart behavior, pickup
availability, and accessibility. Do not use Production Square checkout during
this phase.

## 8. Caddy during the canary

The active temporary route is provided in
`infrastructure/production/caddy/storefront-canary.Caddyfile.example`. Copy its
contents into the independently managed Caddy configuration and attach Caddy
only to `storefront-public-gateway`. Validate and reload Caddy using that
project's existing procedure.

Do not load `modernstate-final.Caddyfile.example` yet. It is prepared only for
the later DNS cutover. The OrderPRO operations UI must use its own public
gateway upstream; never route `operations.modernstate.com` to `orderpro-api`.

## 9. Webhook worker

Configure the Square webhook signature key and `WEBHOOK_WORKER_SECRET` before
installing the timer. Then copy the provided units to `/etc/systemd/system`,
reload systemd, and enable the timer:

```bash
sudo cp infrastructure/production/systemd/storefront-webhook-worker.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now storefront-webhook-worker.timer
sudo systemctl status storefront-webhook-worker.timer
```

Review failed webhook jobs and dead-letter events before enabling payments.

## 10. Rollback

For application rollback, point `/srv/storefront/current` back to the recorded
previous Storefront release, set `STOREFRONT_IMAGE_TAG` to its recorded image
tag, and recreate only the Storefront container with `--no-build`. Do not
restart, deploy, or roll back OrderPRO or PostgreSQL as part of a Storefront
rollback. Keep all checkout and indexing switches disabled.

Do not run `docker compose down -v`: it would remove persistent media. Database
restores require a separate approved maintenance window, an isolated current
state backup, and a rehearsed restore command. A failed application deployment
does not automatically justify rolling back a database migration.

## 11. Final domain cutover

After the domain transfer is complete and the canary is approved:

1. Prepare `A`/`AAAA` records for `modernstate.com` and `www` without changing
   them until the maintenance window.
2. Change the Storefront environment to `https://modernstate.com` and rebuild,
   because `NEXT_PUBLIC_SITE_URL` is a build-time value.
3. Activate `modernstate-final.Caddyfile.example` and validate Caddy.
4. Confirm `www.modernstate.com` redirects to `https://modernstate.com`.
5. Keep `NEXT_PUBLIC_SITE_INDEXABLE=false` until canonical URLs, robots,
   sitemap, HTTPS, and content are verified on the final domain.
6. Configure `operations.modernstate.com` through the independent OrderPRO
   operations deployment, not through the private OrderPRO API network.

## 12. Promotion gates

Promote beyond private canary only after all repository CI jobs pass, backups
and restores are rehearsed, catalog orderability is published, Square Sandbox
payments and webhooks are certified, and the selected fulfillment method passes
its complete OrderPRO hold/confirm/release canary. Enable one customer-impacting
switch at a time.
