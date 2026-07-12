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

1. Square sync imports a new product.
2. Product is marked `NEEDS_PLACEMENT` or `NEEDS_REVIEW`.
3. Staff reviews Square source data.
4. Staff edits website display fields.
5. Staff assigns placements and fulfillment rules.
6. Staff previews the product.
7. Staff publishes.

Products missing descriptions, placements, images, or fulfillment rules remain in Needs Review.

## Placement rules

Rules suggest placement only. They do not publish.

Examples:

- Product name contains "balloon" -> suggest Department: Balloons.
- Product name contains "latex" -> suggest Balloon Section: Latex.
- Product name contains "mylar" -> suggest Balloon Section: Mylar.
- Product name contains "graduation" -> suggest Holiday: Graduation.
- Square category contains "Toys" -> suggest Department: Toys.
- Inflated balloon -> suggest shipping false, pickup true, local delivery true.
