# PostgreSQL and Supabase role bootstrap

This is the operator procedure for the three database identities used by the
real-catalog admin preview. The source of truth is
`infrastructure/postgres/bootstrap-storefront-roles.sql`; it is idempotent,
contains no password, and preserves passwords that have already been set.

Use a direct PostgreSQL connection or the Supabase session pooler on port
`5432`. Do not run role or migration work through the transaction pooler on
port `6543`. Connect as the database owner (`postgres.PROJECT_REF` through
Supavisor), not as an application role. Download the project's Server root
certificate from the Supabase Dashboard, store it outside the repository, and
replace `/path/to/prod-supabase.cer` below with its absolute path. Supabase
recommends `sslmode=verify-full`, which verifies both the certificate authority
and the pooler hostname. `-W` asks for the owner password without placing it in
shell history:

```bash
psql "host=aws-0-REGION.pooler.supabase.com port=5432 dbname=postgres user=postgres.PROJECT_REF sslmode=verify-full sslrootcert=/path/to/prod-supabase.cer" \
  -W -v ON_ERROR_STOP=1 \
  -f infrastructure/postgres/bootstrap-storefront-roles.sql
```

For a new database, run the bootstrap once to create the identities, set three
different random passwords, deploy migrations as `storefront_migrator`, then
rerun the bootstrap to grant access to the relations that now exist. In the
same private owner `psql` session, use `\password`; it avoids putting plaintext
passwords in Git, a SQL file, or the command line:

```text
\password storefront_migrator
\password storefront_sync
\password storefront_runtime
```

New roles are `LOGIN` roles with no usable password until this step. A bootstrap
rerun never rotates an existing password. Store the three resulting URLs in
separate secret stores; Supavisor usernames are
`storefront_migrator.PROJECT_REF`, `storefront_sync.PROJECT_REF`, and
`storefront_runtime.PROJECT_REF`.

Run the normal Prisma deployment with both `DATABASE_URL` and `DIRECT_URL`
pointing to `storefront_migrator`, then reinstall and verify the ACL:

```bash
npm run prisma:migrate:deploy

psql "host=aws-0-REGION.pooler.supabase.com port=5432 dbname=postgres user=postgres.PROJECT_REF sslmode=verify-full sslrootcert=/path/to/prod-supabase.cer" \
  -W -v ON_ERROR_STOP=1 \
  -f infrastructure/postgres/bootstrap-storefront-roles.sql

psql "host=aws-0-REGION.pooler.supabase.com port=5432 dbname=postgres user=postgres.PROJECT_REF sslmode=verify-full sslrootcert=/path/to/prod-supabase.cer" \
  -W -v ON_ERROR_STOP=1 \
  -f infrastructure/postgres/verify-storefront-roles.sql
```

The last command is read-only and must finish with exactly:

```text
             result
--------------------------------
 storefront_role_acl_verified
```

The verifier fails on a missing migration, unsafe role attribute or membership,
wrong owner, a `PUBLIC` grant, a missing required grant, any extra effective
table/column privilege, or a grant option that would let a restricted role
delegate its access. Run it after every schema change and before installing or
rotating application credentials.

The bootstrap persistently grants `storefront_migrator` to the database-owner
session that installs it (`postgres` in Supabase). Supabase's `postgres` role is
not a true PostgreSQL superuser; this membership is required so the Dashboard
and later owner sessions can inspect and manage objects owned by the dedicated
migrator. It does not grant anything to `storefront_runtime` or
`storefront_sync`, and the verifier requires the direct owner membership.
The owner is the only allowed direct migrator member, without `ADMIN OPTION`;
other direct or indirect members are rejected. The runtime and sync identities
must have no members at all.

The two restricted identities must be dedicated application roles. Before
reinstalling their canonical grants, the bootstrap checks PostgreSQL's complete
ownership dependency catalog and stops if either role owns an object. It then
uses explicit `REVOKE ... CASCADE` statements to remove stale grants and any
privileges those reused identities had delegated, without deleting objects.
After ownership has been proven safe, `DROP OWNED ... RESTRICT` is used to
remove every stale direct grant remaining for those roles in this database or on shared
objects, including grants in Supabase platform schemas, and reapplies only the
reviewed `CONNECT`, `public` schema, and object privileges below. The
`DROP OWNED` cleanup remains `RESTRICT`, not `CASCADE`; no owned application or
platform object is eligible for deletion.

This deployment does not use the Supabase Data API. The bootstrap therefore
removes `PUBLIC` access to the `public` schema and, when the standard Supabase
roles exist, revokes all effective access for `anon`, `authenticated`, and
`service_role` on every managed Storefront table, column, sequence, routine,
and enum. It clears both global and schema-local default grants for objects
created by `storefront_migrator`. Projects without those Supabase roles remain
supported; the bootstrap and verifier discover them rather than assuming they
exist.

These revocations do not alter Supabase's `auth`, `storage`, `realtime`, or
other platform schemas and do not modify defaults owned by Supabase service
roles or `postgres`. If the application later adopts the Data API, stop using
this ACL unchanged: design RLS policies and a reviewed API-role grant manifest
first. Adding broad grants to these roles would reopen customer, order, return,
and administration tables that this preview deliberately keeps private.

## Reviewed privilege boundary

| Role | Allowed objects | Effective privileges |
| --- | --- | --- |
| `storefront_migrator` | `public` schema, all Prisma models and enums, `_prisma_migrations` | Owns migration objects; `USAGE, CREATE` on `public`; granted to Supabase `postgres` for Dashboard/operator management; no superuser, database creation, role creation, replication, RLS bypass, or inherited role |
| `storefront_sync` | `SquareCatalogObject`, `SquareItemVariation`, `SquareInventoryCount`, `SquareCatalogSyncState` | `SELECT, INSERT, UPDATE` for the Square-to-PostgreSQL projection |
| `storefront_sync` | `StoreLocation` | `SELECT`; `UPDATE` only on `squareLocationId` and Prisma's `updatedAt` column for the reviewed mapping command |
| `storefront_sync` | `AuditLog` | `SELECT, INSERT` only, so a successful mapping change can be recorded |
| `storefront_runtime` | `StoreLocation`, the four Square projection tables, `CmsContentVersion` | `SELECT` only for public/admin catalog reads, inventory freshness, locations, merchandising, and homepage state |
| `storefront_runtime` | `AdminRateLimitBucket` | `SELECT, INSERT`; `UPDATE` only on `count`, `expiresAt`, and `updatedAt` for admin-login throttling |
| Supabase `anon`, `authenticated`, `service_role` (when present) | Managed Storefront objects in `public` | No effective schema, table, column, sequence, routine, or enum privileges; Data API is closed |

Everything else in `prisma/schema.prisma` is denied to the sync and runtime
roles. In particular, neither role can access customer accounts, sessions,
orders, checkout attempts, returns, webhook inboxes, fulfillment holds, admin
users, or media writes. The current `/api/cart` preview endpoint calculates a
quote from the synchronized catalog and does not persist `Cart` or `CartItem`,
so those tables deliberately receive no runtime grant. Admin-preview CMS
mutations are blocked by the route allowlist, so `CmsContentVersion` is also
read-only.

The sync role does not receive `CmsContentVersion`; the catalog-preview
procedure does not use the checkout-readiness mode. Adding a route, CLI mode,
Prisma model, sequence, enum, or database routine is fail-closed: update the
reviewed SQL manifests and tests before rerunning the bootstrap.

At database scope the bootstrap removes every direct privilege from the three
application roles, grants only `CONNECT`, and verifies that none can `CREATE` a schema or
own the database. PostgreSQL normally grants `TEMPORARY` through the pseudo-role
`PUBLIC`; this bootstrap deliberately leaves that cluster/database convention
unchanged because changing it would affect Supabase-managed roles too. A temp
schema is session-private and does not bypass the explicit `public` schema,
table, column, type, or routine ACLs verified here.

## Credential and permission checks

After the ACL verifier passes, test each credential through the same connection
path its service will use. Enter passwords only at the `-W` prompt:

```bash
psql "host=aws-0-REGION.pooler.supabase.com port=5432 dbname=postgres user=storefront_migrator.PROJECT_REF sslmode=verify-full sslrootcert=/path/to/prod-supabase.cer" -W -c "select current_user"
psql "host=aws-0-REGION.pooler.supabase.com port=5432 dbname=postgres user=storefront_sync.PROJECT_REF sslmode=verify-full sslrootcert=/path/to/prod-supabase.cer" -W -c "select current_user"
psql "host=aws-0-REGION.pooler.supabase.com port=5432 dbname=postgres user=storefront_runtime.PROJECT_REF sslmode=verify-full sslrootcert=/path/to/prod-supabase.cer" -W -c "select current_user"
```

Do not paste a populated URL into a ticket, terminal transcript, CI log, or this
repository. Percent-encode each password when it is placed in a URL.

## Recovery and rollback

For ACL drift or a partially completed install, do not add an ad hoc grant.
Rerun the bootstrap as the owner, then rerun the verifier. Both operations are
transactional; an error rolls the bootstrap back.

For a lost or exposed password, disable the affected login first, terminate or
restart its application pool, rotate it with `\password`, update only that
service's secret, and restore login:

```sql
ALTER ROLE storefront_runtime NOLOGIN;
-- In private psql: \password storefront_runtime
ALTER ROLE storefront_runtime LOGIN;
```

Use the same sequence for `storefront_sync` or `storefront_migrator`. Disabling
a role does not terminate an already established session, so stop the relevant
service before relying on `NOLOGIN`.

To remove all three roles while preserving schema and data, first stop runtime,
sync, and migration jobs. In every database where these cluster-wide roles were
used, connect as the owner and run the following only after confirming that
`postgres` is the intended replacement owner:

```sql
BEGIN;
REASSIGN OWNED BY storefront_migrator TO postgres;
DROP OWNED BY storefront_runtime;
DROP OWNED BY storefront_sync;
DROP OWNED BY storefront_migrator;
REVOKE storefront_migrator FROM postgres;
DROP ROLE storefront_runtime;
DROP ROLE storefront_sync;
DROP ROLE storefront_migrator;
COMMIT;
```

`REASSIGN OWNED` preserves tables, types, indexes, constraints, and data;
`DROP OWNED` then removes grants and default-ACL dependencies. It is scoped to
the connected database, while `DROP ROLE` is cluster-wide. If `DROP ROLE`
reports dependencies, roll back and inventory the other databases instead of
using `CASCADE`. The bootstrap's secure `PUBLIC` revocations are intentionally
not reversed.
