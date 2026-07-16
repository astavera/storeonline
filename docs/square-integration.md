# Square Integration

## Source of truth

Square remains the source of truth for catalog items, variations, prices, inventory, orders, payments, taxes, business reporting, and existing Square categories.

## Read-only website policy

- Do not mutate `reporting_category`.
- Do not restructure Square categories for website navigation.
- Do not change Square prices unless explicitly approved.
- Do not change Square inventory counts unless explicitly approved.
- Use website departments and holiday assignments in the app database.
- Read Square vendors as optional merchandising references; keep public website
  brands, logos, visibility, and product-to-brand assignments in the app.

## Catalog soft deletion

- Treat Square catalog tables as an append/update cache; catalog sync never
  hard-deletes an item or variation.
- When Square reports an item deleted, set `SquareCatalogObject.deletedAt` and
  exclude that item and its variations from sale and merchandising queries.
- Keep variation rows so historical orders and website configuration retain valid
  foreign keys; deletion reported in a variation's Square payload also makes it
  unavailable.
- Clear `deletedAt` only after Square reports the same object active again.
- Reserve physical deletion for an explicit maintenance procedure that first
  archives or migrates every dependent record.

## Server-only implementation

Initial server-only helpers live in `src/server/square/client.ts`.

- `getSquareRuntimeConfig()` exposes only safe booleans and environment state.
- `assertSquareWriteAllowed()` blocks writes outside Sandbox.
- Webhook signature verification lives in `src/server/square/webhook-signature.ts`.
- `auditSquareCatalogReadOnly()` provides a bounded location and catalog smoke test without exposing any mutation method.
- `readConfiguredSquareVendorsReadOnly()` reads active vendor references for the
  Admin brand manager and returns an empty list if the current Square connection
  cannot expose vendors. It never creates or updates a Square vendor.

## Read-only audit

The Square connection in `.codex/config.toml` is configured with `DISALLOW_WRITES=true` and `PRODUCTION=true`. A bounded production read-only audit was explicitly requested and completed on July 13, 2026. See `docs/square-readonly-audit.md` for results and limitations.

Production catalog and inventory synchronization requires both
`SQUARE_ENVIRONMENT=production` and
`SQUARE_ALLOW_PRODUCTION_READONLY_SYNC=true`. This second flag is a kill switch
for reads only; it does not authorize Square catalog mutations, inventory
changes, orders, or payments. Checkout remains `validation_only`. Payment-flow
tests must use Square Sandbox test values because Production payment requests
process real transactions and can incur fees.

## Production read-only runbook

Run these commands from the repository root. None of them writes to Square.

```bash
npm run sync:square:postgres:readonly -- --check
npm run sync:square:postgres:readonly -- --locations
npm run sync:square:postgres:readonly
npm run sync:square:postgres:readonly -- --status
npm run sync:square:postgres:readonly -- --checkout-readiness
```

The location apply and abandoned-lease recovery modes require their exact
confirmation strings. Use them only after reviewing the preceding audit:

```bash
npm run sync:square:postgres:readonly -- --apply-locations --confirm modern-state-square-location-mapping-v1
npm run sync:square:postgres:readonly -- --recover-catalog-lease --confirm abandoned-square-catalog-sync-v1
```

The initial Production sync completed on July 15, 2026 with 66,141 active
items, 74,640 active variations, and 223,920 inventory rows. Both operational
stores are mapped. Later syncs use Square timestamps and retrieve only changes.

Checkout inventory is evaluated at the selected mapped store. Checkout remains
`validation_only`: it records an idempotent validation attempt but never creates
a Square order or captures a payment. The readiness audit may validate a DRAFT
merchandising version against real prices and inventory, but the runtime accepts
only a PUBLISHED version. Publishing remains an explicit content operation.

Audit the exact candidate before publication:

```bash
npm run publish:merchandising
```

The audit returns a digest-bound confirmation. Publication copies the reviewed
payload into a new immutable PUBLISHED CMS version inside a serializable
transaction and writes an audit-log record. It never mutates the source DRAFT:

```bash
npm run publish:merchandising -- --apply --confirm <confirmation-from-audit>
```

When shipping is not operationally available, prepare a new immutable DRAFT
that removes shipping while preserving pickup and local delivery. Audit first;
applying the returned confirmation does not publish content:

```bash
npm run prepare:merchandising:no-shipping
npm run prepare:merchandising:no-shipping -- --apply --confirm <confirmation-from-audit>
```

Before publishing a test version, verify the rollback workflow is available.
Rollback never deletes history: it creates a newer PUBLISHED version containing
the previous published payload, or an empty storefront baseline when no earlier
publication existed. Audit first, then apply its exact confirmation:

```bash
npm run rollback:merchandising
npm run rollback:merchandising -- --apply --confirm <confirmation-from-rollback-audit>
```

## Remaining production work

1. Review and explicitly publish the imported website merchandising version.
2. Configure `WEBHOOK_WORKER_SECRET` and schedule the internal catalog and webhook workers.
3. Complete delivery-zone, fee, slot, capacity, lead-time, and cutoff business data.
4. Approve and map the warehouse before enabling shipping availability.
5. Add Square order creation and Payments only under a separate approval and rollback procedure.
