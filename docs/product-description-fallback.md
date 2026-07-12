# Product Description Fallback

Square item descriptions are the baseline product description source.

## Sync fields

Square sync imports:

- `CatalogItem.description_html`
- `CatalogItem.description_plaintext`
- legacy description fallback, if present
- Square item name
- Square item images
- Square variations
- Square price
- Square inventory
- Square categories and `reporting_category` as read-only reference

## Display rule

1. If a published website override description exists, display the website override.
2. Otherwise display Square `description_html` after safe sanitization.
3. Otherwise display Square `description_plaintext`.
4. Otherwise mark the product as Needs Description in admin.

## Sanitization

Raw Square HTML is never blindly rendered. The allowlist sanitizer in `src/features/catalog/services/product-description-service.ts` keeps simple formatting tags and removes scripts, iframes, unsafe attributes, inline event handlers, unsafe URLs, forms, embeds, SVG, and other untrusted markup.

## Change handling

If the Square description changes:

- Products using Square description update website display automatically.
- Products with manual website override are not overwritten.
- Manual overrides are marked `OUTDATED_SQUARE_CHANGED`.
- Admin should compare Square vs Website Description before publishing a new version.

Website description edits are never written back to Square unless explicitly approved.
