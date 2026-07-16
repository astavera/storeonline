# Square Read-only Audit

Status: production catalog read-only audit completed on July 13, 2026.

The audit used the configured Square connection with `DISALLOW_WRITES=true`. It called only `locations.list` and `catalog.list`; it did not create, update, delete, or upsert any Square object.

## Observed production shape

- Three active physical USD locations: `72`, `86`, and `Warehouse`.
- 127 Square categories across two paginated responses.
- The first two item pages contained 200 items and 1,374 nested variations, with additional item pages still available.
- All 1,374 sampled variations had a price amount and inventory tracking enabled.
- Only 22 of the 200 sampled items had a description.
- Only 23 of the 200 sampled items referenced an image.
- Items and variations use location-specific presence and sold-out overrides across the three locations.
- Some items have hundreds of variations, so item count cannot be used as a proxy for SKU count or sync cost.

These are bounded audit numbers, not final catalog totals. A full backfill must consume every cursor and record metrics without logging the full raw catalog payload.

## Design consequences

1. Keep Square categories and `reporting_category` unchanged; website departments remain a separate PostgreSQL concern.
2. Normalize item and variation records before exposing them to the storefront.
3. Require a publish/readiness policy for missing descriptions, images, and website placement.
4. Persist location presence, location overrides, prices, and inventory state independently.
5. Use bounded pages for smoke tests and full cursor consumption only in the durable backfill worker.
6. Never log access tokens or the complete production response.

## Repeatable local smoke test

Copy the required Square values into ignored `.env.local` and run:

```bash
npm run test:square:catalog
```

The test defaults to two pages and accepts `SQUARE_CATALOG_TEST_MAX_PAGES` from 1 through 10. Local and CI use Sandbox by default. A production read-only audit requires `SQUARE_ENVIRONMENT=production` and must remain bounded.

For local visual review, `/shop` can read the ignored, sanitized file at
`data/square-catalog-preview.json`. Preview cards cannot open product detail or
add items to the cart. The file must never contain access tokens or the complete
raw Square response.

Production publishing invariant: the Square snapshot is an inbox, not a public
catalog. A sync creates hidden, incomplete placement records and never creates
website categories or publishes products. Shop, homepage product areas, and
search results use the shared website catalog resolver. A product becomes
eligible only after an administrator selects a visible website category, at
least one website surface, at least one fulfillment method, and explicitly
turns on website publishing. Holiday pages also require a product date window
inside the holiday campaign window.

The Admin placement workspace at `/admin/product-placement` uses that snapshot as
a read-only product source. Website categories, visibility, order, and product
assignments are stored in PostgreSQL outside development; the ignored local JSON
store is an explicit development-only fallback. Saving those settings never
writes category or catalog changes back to Square. The Shop page uses the saved
website merchandising configuration for its category filters.
Product placements can also carry one or more website-only recommended age
groups (`0–2`, `3–4`, `5–7`, `8–10`, `11–12`, and `13+`). Those values feed the
shared catalog resolver and the Shop age filter; they are not written to Square.

## Subsequent production read-only completion

On July 15, 2026, the separately approved durable Production read-only workflow
completed the full backfill into shared PostgreSQL: 66,141 active items, 74,640
active variations, and 223,920 inventory rows. The two storefront locations were
mapped, checkout readiness was evaluated per location, and later incremental
runs completed without Square writes. See `docs/phase-1-handoff.md` for the dated
state and exact operational commands.

## Remaining audit work

- Audit images, taxes, modifiers, and location overrides with bounded summaries.
- Continue scheduled incremental reconciliation and alert on stale inventory,
  abandoned leases, webhook backlog, and soft-deletion drift.
- Re-run checkout readiness after material Square or merchandising changes.
