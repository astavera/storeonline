# Database Schema Proposal

The first schema proposal lives in `prisma/schema.prisma`. Its Phase 1 PostgreSQL
baseline lives in
`prisma/migrations/20260712180000_initial_schema/migration.sql`.

It covers:

- Square catalog cache
- Square item variations
- Square inventory counts
- Website departments
- Editable holidays
- Product-to-department assignments
- Product-to-holiday assignments
- Product overrides
- Website product placements
- Product placement rules
- Product image display preferences
- CMS content versions
- Media library assets
- Carts and cart items
- Order mirrors and order items
- Fulfillment tasks
- Delivery zones
- Slot templates and holds
- Shipping rate quotes
- Webhook events
- Admin users
- Admin audit logs

## Phase 1 verification

On 2026-07-12 the baseline was applied from an empty database to disposable
PostgreSQL 17.10. Prisma reported the schema up to date, PostgreSQL contained 26
application tables, 8 enums, and 25 foreign keys, and a transactional catalog
write/read smoke test passed before rolling back all test rows.

On 2026-07-15 all six committed migrations were applied to the shared Supabase
database. `prisma migrate status` reported the schema up to date, and the
read-only operational audit confirmed all 24 expected check constraints present,
validated, and free of known violations. Use `docs/MASTER_ROADMAP.md` and
`docs/phase-1-handoff.md` for the current program status.

GeoJSON is stored as JSON in the first proposal. Production can add PostGIS geometry columns through a SQL migration once the deployment database is selected.

## Advanced admin additions

The schema now includes `WebsiteProductPlacement`, `ProductPlacementRule`, `CmsContentVersion`, and `MediaAsset`.

Square catalog objects include website-safe description sync fields:

- `descriptionHtml`
- `descriptionPlaintext`
- `squareDescriptionHash`
- `lastDescriptionSyncedAt`

## Square catalog retention policy

Square catalog rows are a local, read-only cache and use soft deletion. A sync that
receives a Square deletion marks `SquareCatalogObject.deletedAt`; it must not
physically delete the catalog object or its `SquareItemVariation` rows. Variations
also remain unavailable when their Square payload reports deletion or their parent
item is soft-deleted. This preserves order history and website merchandising
references, whose foreign keys intentionally restrict variation deletion.

A later Square upsert for the same object clears `deletedAt` only when Square
reports it active again. Normal catalog sync jobs must never cascade-delete product
overrides, assignments, placements, cart lines, or order lines. Hard deletion is a
separate, reviewed maintenance operation permitted only after dependent records
have been archived or migrated.

Website records store only `squareVariationId`; the parent Square item identity is
resolved through `SquareItemVariation.itemId`, avoiding duplicate `squareItemId`
values that could drift out of sync.

Website product overrides include no-code display, fulfillment, publishing, and description fallback fields:

- `webStatus`
- `webShortDescriptionEn`
- `webDescriptionEn`
- `descriptionSource`
- `descriptionStatus`
- `useSquareDescription`
- `lockWebDescription`
- `lastSquareDescriptionSyncedAt`
- fulfillment flags and capacity points
- scheduled publish and unpublish timestamps
- `ageGroups` for reusable storefront age filters
- `websiteSurfaces` for explicit Shop, homepage, search, category, and holiday placement

Category and holiday membership use `WebsiteProductPlacement`. Holiday placements
use `startsAt` and `endsAt` for product-specific campaign windows. The database
defaults for age groups and website surfaces are empty so a catalog sync cannot
make a product visible by implication.

## Phase 0 operational hardening (applied)

`20260715123000_phase0_operational_hardening` follows the three original
migrations without rewriting them. It adds durable `CheckoutAttempt`,
`WebhookInboxEvent`, `SlotOccurrence`, `CapacityHold`, `DeliveryZoneVersion`,
`DeliveryRateRule`, `AddressEvaluation`, `BalloonOrderDraft`, `BalloonDraftLine`,
and `BalloonQuote` tables.

The migration adds nonnegative money/capacity checks, positive quantities, valid
date and schedule ranges, compatible state/timestamp checks, operational indexes,
and restrictive foreign keys for order, slot, and delivery records. Checks on
existing tables were introduced with PostgreSQL `NOT VALID`, audited, and then
validated by `20260715180000_validate_operational_constraints` after the runtime
foundation migration. Future schema changes must use new migrations; never edit
these applied files.
