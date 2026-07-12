# Database Schema Proposal

The first schema proposal lives in `prisma/schema.prisma`.

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

GeoJSON is stored as JSON in the first proposal. Production can add PostGIS geometry columns through a SQL migration once the deployment database is selected.

## Advanced admin additions

The schema now includes `WebsiteProductPlacement`, `ProductPlacementRule`, `CmsContentVersion`, and `MediaAsset`.

Square catalog objects include website-safe description sync fields:

- `descriptionHtml`
- `descriptionPlaintext`
- `squareDescriptionHash`
- `lastDescriptionSyncedAt`

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
