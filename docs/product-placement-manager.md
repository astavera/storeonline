# Product Placement Manager

The Product Placement Manager is the no-code merchandising layer between Square's source-of-truth catalog and the website's customer-facing taxonomy.

## Square owns

- Product existence
- Square item ID
- Square variation ID
- Price
- Inventory
- SKU
- Images
- Taxes
- Square categories
- Square `reporting_category`

## Website owns

- Public brands, brand names, descriptions, logos, and homepage promotion
- Product-to-brand assignments (optionally linked to Square vendor references)
- Where products appear on the website
- Department assignments
- Holiday assignments
- Balloon section assignments
- Homepage placements
- Product group placements
- Search group placements
- Promo section placements
- Sort order
- Featured status
- Visibility
- Website badges
- Website SEO
- Website description
- Fulfillment eligibility

## Flexible placement model

`WebsiteProductPlacement` supports:

- `DEPARTMENT`
- `HOLIDAY`
- `BALLOON_SECTION`
- `HOMEPAGE_SECTION`
- `PRODUCT_GROUP`
- `SEARCH_GROUP`
- `PROMO_SECTION`

A graduation mylar balloon can appear in `/balloons`, `/balloons/mylar`, `/holidays/graduation`, `/party-supplies`, homepage featured products, and search results without changing Square categories.

## Admin workflow

Catalog Publishing is divided into task-focused modules under its Admin sidebar
entry so the Admin does not render every control at once:

- **Overview** shows publishing health and entry points.
- **Website structure** shows only one of Brands, Categories, or Holidays.
- **Products** handles one complete product record at a time.
- **Bulk & import** contains multi-select actions and CSV/Excel workflows.

Website Structure expands to direct sidebar links for Brands, Categories, and
Holidays. Hash-based navigation switches modules without reloading the page or
discarding an unsaved merchandising draft.

Draft merchandising state and the global save indicator remain shared while
moving between modules.

Categories use a production storefront taxonomy with exactly two levels:
**main category → subcategory**. The Admin category organizer supports up to 500
website categories, searchable collapsed branches, sibling ordering, visibility,
and safe parent reassignment. A main category cannot be deleted or converted to
a subcategory until its children are moved or removed. Hiding a main category
also makes its children ineffective for publishing.

Shop initially renders Category, By Brand, Age, Fulfillment, and Price as closed
filter groups. Opening Category shows main categories first and expands only the
requested branch. Selecting a main category includes products assigned directly
to it and products assigned to any of its subcategories. Brand membership remains
independent from Square vendor metadata.

1. Square sync imports a new product into the internal inbox only.
2. Product is hidden and marked `NEEDS_PLACEMENT` or `NEEDS_REVIEW`.
3. Staff reviews Square source data.
4. Staff creates or selects website categories. Square categories are never copied
   into the customer-facing taxonomy automatically.
5. Staff optionally assigns holiday campaigns with product-specific start and end
   dates.
6. Staff optionally assigns one or more public website brands. A website brand
   can reference a Square vendor without copying Square's vendor name into the
   storefront automatically.
7. Staff chooses website surfaces, age ranges, and fulfillment rules.
8. Staff previews and explicitly publishes the product.

Products missing a visible website category, website surface, or fulfillment rule
remain in Needs Review. Holiday-page products also require an enabled campaign
and a valid product date window.

The production invariant is **sync does not publish**. A new Square item has no
website categories, holidays, surfaces, or fulfillment modes and remains hidden
until an administrator completes its website merchandising record.

The shared resolver enforces this invariant on Shop, homepage product areas,
search, legacy department pages, dynamic `/categories/[slug]` pages, holiday
pages, and direct product routes.

## Bulk workflow

The Bulk edit mode uses the same hidden-draft and readiness rules as individual
editing. Staff can filter the loaded Square snapshot by source category,
publishing status, or search text; select every matching result; and then add,
remove, replace, or preserve website categories, surfaces, age ranges, and
fulfillment modes across the selection. The same controls can add, remove, or
replace website-brand assignments.

Holiday campaigns and sequential sort orders can also be assigned in bulk.
Structural changes return affected products to hidden draft. The optional
`Publish ready only` action publishes only records that pass the shared
readiness checks and leaves incomplete records hidden. Nothing is written back
to Square, and bulk changes are persisted only after `Save merchandising`.

### Spreadsheet workflow

Bulk mode can export the currently loaded Square catalog as a UTF-8 CSV that
opens in Excel or Google Sheets. Admin can upload the edited CSV or an `.xlsx`
workbook and validate it before applying any changes to the merchandising
draft. Each row is keyed by the read-only `square_variation_id`.

The guided export starts with an `EXAMPLE` row that demonstrates every value
format and is always ignored during import. Real product rows start with
`row_action=SKIP`; Admin must change a completed row to `APPLY` before the
importer will validate or apply it. Files without the optional `row_action`
column remain backward-compatible and are processed as before.

Editable columns are website categories, website brands, website surfaces, age ranges,
fulfillment, holiday assignments, sort order, and publishing. Blank cells keep
the current value; `CLEAR` removes all assignments in that cell; and `|`
separates multiple values. Holiday assignments use
`holiday-slug@YYYY-MM-DD@YYYY-MM-DD`.

Invalid rows are reported with spreadsheet row numbers and skipped. Valid rows
can be applied to the Admin draft, but they are not persisted until `Save
merchandising`. Imported structural changes return products to hidden first,
and `PUBLISH_READY` only publishes rows that pass the shared readiness checks.

## Website brands and Square vendors

Square vendors are read-only source references. Admin can create a public brand
from a returned Square vendor or create it manually, then edit its public name,
slug, description, logo, accessibility text, visibility, and homepage-featured
state. Products can belong to multiple website brands.

Visible featured brands with logos replace the default hero tiles (up to four).
Each tile links to `/shop?brand=<slug>`, where Shop filters to published products
assigned to that brand. A Square vendor is never published directly and Square
is never modified by this workflow.

## Placement rules

Rules suggest placement only. They do not publish.

Examples:

- Product name contains "balloon" -> suggest Department: Balloons.
- Product name contains "latex" -> suggest Balloon Section: Latex.
- Product name contains "mylar" -> suggest Balloon Section: Mylar.
- Product name contains "graduation" -> suggest Holiday: Graduation.
- Square category contains "Toys" -> suggest Department: Toys.
- Inflated balloon -> suggest shipping false, pickup true, local delivery true.
