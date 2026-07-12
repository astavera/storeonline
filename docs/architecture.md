# Architecture

## System intent

Modern State ecommerce is a modular Next.js App Router application with server-only commerce integrations, a PostgreSQL application database, a Square catalog/inventory/order/payment source of truth, and admin-managed website merchandising.

## Ownership boundaries

- Square owns catalog items, variations, prices, inventory, orders, payments, taxes, business reporting, and existing reporting categories.
- The website database owns website departments, holidays, SEO, display overrides, image preferences, balloon builder configuration, delivery zones, pickup and delivery slots, shipping rules, fulfillment tasks, and audit logs.
- Frontend components render trusted server state and never validate final pricing, delivery fees, shipping rates, slot capacity, or inventory alone.

## Application layers

- `src/app`: routes, API entry points, route groups for storefront, checkout, and admin.
- `src/components`: reusable UI, commerce, sections, templates, checkout, admin, and layout components.
- `src/config`: editable configuration for navigation, homepage, departments, holidays, locations, redirects, balloons, the store section registry, and the admin control plane.
- `src/design`: tokens, themes, and presets for layout, grids, cards, buttons, and color.
- `src/features`: domain logic by area.
- `src/server`: server-only Square, checkout, fulfillment, shipping, workers, and admin modules.
- `prisma/schema.prisma`: initial database schema proposal.

## Production admin tradeoff

The scaffold renders real routes and configuration-driven sections. Admin modules now expose validated no-code edits and CMS workflow payloads. Production persistence is designed for `CmsContentVersion` records behind `/api/admin` when `DATABASE_URL`, authentication, RBAC, CSRF protection, and audit persistence are configured. Square writes, carrier purchases, and payment capture remain server-only and are not exposed through no-code admin fields.
