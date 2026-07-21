# Store Section Map

The source of truth is `src/config/store-section-registry.ts`. Rendered sections use `data-store-section`, `data-store-area`, `data-store-component`, and `data-store-variant` when applicable.

| Area | Section ID | Visual location | Main component | Config | Admin-editable fields | Business logic | Safety notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Homepage | `home.hero` | First viewport | `HomePageTemplate` | `homepage.config.ts` | copy, CTA, image | department service | No Square data here |
| Homepage | `home.departments` | Department cards | `DepartmentCardGrid` | `departments.config.ts` | visibility, sort, accents | department service | Do not edit Square categories |
| Homepage | `home.featured-products` | Featured grid | `ProductGrid` | homepage/product overrides | assignments, badges | catalog display service | Prices remain Square-owned |
| Homepage | `home.balloon-promo` | Balloon promo | `HomePageTemplate` | `balloons.config.ts` | copy, CTA | balloon service | No slot locking here |
| Homepage | `home.local-storefront` | Store cards | `HomePageTemplate` | `locations.config.ts` | public location copy | location service | Delivery zones are backend-owned |
| Toys | `toys.hero` | Department hero | `DepartmentPageTemplate` | `departments.config.ts` | copy, SEO, image | department service | Website taxonomy only |
| Toys | `toys.product-grid` | Product grid | `ProductGrid` | product assignments | products, sort | catalog display service | Do not alter Square prices |
| Party Supplies | `party-supplies.hero` | Department hero | `DepartmentPageTemplate` | `departments.config.ts` | copy, SEO, image | department service | Website taxonomy only |
| Party Supplies | `party-supplies.event-types` | Occasion cards | `DepartmentPageTemplate` | department admin | labels, assignments | department service | No reporting changes |
| Party Supplies | `party-supplies.product-grid` | Product grid | `ProductGrid` | product assignments | products, sort | catalog display service | Inventory remains Square-owned |
| Balloons | `balloons.landing-hero` | Balloon hero | `BalloonsPageTemplate` | `balloons.config.ts` | copy, image | balloon service | No payment or slot logic |
| Balloons | `balloons.builder` | Guided builder | `BalloonsPageTemplate` | `balloons.config.ts` | templates, add-ons | balloon and slot services | Critical fulfillment area |
| Balloons | `balloons.occasion-selector` | Builder step | `BuilderStepCard` | balloon admin | occasions | balloon service | No price trust |
| Balloons | `balloons.type-selector` | Flow cards | `BalloonsPageTemplate` | `balloons.config.ts` | types, mapping | balloon service | Stocked items need variations |
| Balloons | `balloons.color-selector` | Builder step | `BuilderStepCard` | balloon admin | colors | balloon service | Inventory tracked in Square |
| Balloons | `balloons.addons-selector` | Builder step | `BuilderStepCard` | balloon admin | add-ons | balloon service | Stocked add-ons need variations |
| Balloons | `balloons.fulfillment-selector` | Pickup/delivery cards | `BalloonsPageTemplate` | locations/zones | mode copy | fulfillment router | Backend validates zones |
| Balloons | `balloons.time-slot-picker` | Capacity note | `BalloonsPageTemplate` | slot admin | slots, points | slot capacity service | Backend locks capacity |
| Stationery | `stationery.hero` | Department hero | `DepartmentPageTemplate` | `departments.config.ts` | copy, SEO | department service | Website taxonomy only |
| Stationery | `stationery.product-grid` | Product grid | `ProductGrid` | product assignments | products | catalog service | Square owns price/inventory |
| Arts & Crafts | `arts-crafts.hero` | Department hero | `DepartmentPageTemplate` | `departments.config.ts` | copy, SEO | department service | Website taxonomy only |
| Arts & Crafts | `arts-crafts.product-grid` | Product grid | `ProductGrid` | product assignments | products | catalog service | Square owns price/inventory |
| Greeting Cards | `greeting-cards.hero` | Department hero | `DepartmentPageTemplate` | `departments.config.ts` | copy, SEO | department service | Website taxonomy only |
| Greeting Cards | `greeting-cards.occasion-grid` | Product grid | `ProductGrid` | card occasions | occasions | department service | No Square reporting edits |
| Gifts | `gifts.hero` | Department hero | `DepartmentPageTemplate` | `departments.config.ts` | copy, SEO | department service | Website taxonomy only |
| Gifts | `gifts.product-grid` | Product grid | `ProductGrid` | product assignments | products | catalog service | Square owns price/inventory |
| Holidays | `holidays.index-hero` | Holiday index | `HolidaysIndexTemplate` | `holidays.config.ts` | copy, image | holiday service | Editable parent |
| Holidays | `holidays.active-holidays-grid` | Holiday cards | `HolidaysIndexTemplate` | `holidays.config.ts` | dates, active, sort | holiday service | Admin-audited |
| Holidays | `holidays.detail-hero` | Holiday detail hero | `HolidayDetailTemplate` | `holidays.config.ts` | copy, SEO, accent | holiday service | Website campaign only |
| Holidays | `holidays.detail-product-grid` | Holiday products | `ProductGrid` | holiday assignments | products, badges | catalog service | No price changes |
| Cart | `cart.drawer` | Cart page | `CartPageTemplate` | cart service | none | cart service | Server validates cart |
| Cart | `cart.order-summary` | Cart summary | `CartPageTemplate` | cart service | none | cart service | No trusted client totals |
| Checkout | `checkout.customer-info` | Checkout page | `CheckoutPageTemplate` | checkout service | none | checkout service | Protect PII |
| Checkout | `checkout.fulfillment` | Checkout fulfillment | `CheckoutPageTemplate` | fulfillment router | eligibility copy | fulfillment router | Split invalid carts |
| Checkout | `checkout.payment` | Payment area | `CheckoutPageTemplate` | Square config | none | Square client | Never store raw card data |
| Checkout | `checkout.order-summary` | Summary card | `CheckoutPageTemplate` | checkout service | none | checkout service | Server finalizes totals |
| Admin | `admin.homepage-sections` | Admin homepage editor | `AdminPageShell` | homepage config | controlled fields | admin audit service | No arbitrary CSS |
| Admin | `admin.navigation` | Navigation manager | `AdminPageShell` | navigation config | labels, order, visibility | CMS workflow service | No auth or Square category edits |
| Admin | `admin.departments` | Department manager | `AdminPageShell` | departments config | department fields | department service | Do not mutate Square category |
| Admin | `admin.holidays` | Holiday manager | `AdminPageShell` | holidays config | holiday fields | holiday service | Audit date changes |
| Admin | `admin.product-placement-manager` | Product placement manager | `ProductPlacementManager` | placement tables | placement, order, visibility, schedule | placement service | Do not mutate Square reporting/category data |
| Admin | `admin.product-display` | Product display editor | `AdminPageShell` | product override table | web title, descriptions, badge, status | description/display services | Website-only fields |
| Admin | `admin.product-seo` | Product SEO editor | `AdminPageShell` | product override table | SEO title, description, OG, canonical | display service | Website-only SEO |
| Admin | `admin.product-images` | Product images editor | `AdminPageShell` | image preferences | primary, gallery, alt text | display service | Do not write order back to Square |
| Admin | `admin.delivery-zones` | Zone editor | `AdminPageShell` | delivery zone tables | polygons, fees | delivery zone service | Backend validation required |
| Admin | `admin.pickup-slots` | OrderPro handoff | `OrderProManagedPanel` | `ORDERPRO_ADMIN_URL` | none | OrderPro integration | Do not create local slots |
| Admin | `admin.balloon-builder` | Builder manager | `AdminPageShell` | balloon config | components, add-ons | balloon service | Stock mapping matters |
| Admin | `admin.product-overrides` | Product override manager | `AdminPageShell` | product override table | SEO, visibility | catalog service | Do not change Square prices |
| Admin | `admin.image-settings` | Image settings | `AdminPageShell` | image preferences | primary image, order | catalog service | Do not delete Square images |
| Admin | `admin.media-library` | Media library | `AdminPageShell` | media assets | alt text, usage, visibility | admin audit service | No secret files |
| Admin | `admin.users-roles` | Users and roles | `AdminPageShell` | admin users | role, location scope, MFA readiness | auth/admin audit services | Critical access control |
| Admin | `admin.fulfillment-dashboard` | OrderPro handoff | `OrderProManagedPanel` | `ORDERPRO_ADMIN_URL` | none | OrderPro integration | Do not duplicate orders or statuses |
