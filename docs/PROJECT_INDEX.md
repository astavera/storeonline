# Project Index

Índice rápido del árbol de trabajo analizado el 20 de agosto de 2026. Empieza por el mapa escrito para contexto y usa el mapa HTML para explorar relaciones.

## Start here

- [Mapa técnico exhaustivo](./TECHNICAL_PROJECT_MAP.md)
- [Mapa visual navegable](./PROJECT_MAP.html)
- [`README.md`](../README.md) — onboarding general; su descripción de checkout está desactualizada.
- [`package.json`](../package.json) — comandos, versiones y feature tooling.
- [`src/app`](../src/app) — entry points web/API.
- [`prisma/schema.prisma`](../prisma/schema.prisma) — source of truth del modelo relacional.

## Frontend

- [`src/app/layout.tsx`](../src/app/layout.tsx) — layout/metadata raíz.
- [`src/app/(store)`](../src/app/(store)) — storefront y páginas SEO.
- [`src/app/(checkout)`](../src/app/(checkout)) — cart, checkout y confirmación.
- [`src/app/(admin)`](../src/app/(admin)) — panel autenticado.
- [`src/components`](../src/components) — componentes globales, checkout, admin, fulfillment y returns.
- [`src/features/homepage`](../src/features/homepage) — homepage y editor visual.
- [`src/features/catalog`](../src/features/catalog) — catálogo y merchandising.
- [`src/design`](../src/design) — tokens/themes.

## Routing and middleware

- [`src/proxy.ts`](../src/proxy.ts) — gates, sesión y permiso mínimo admin.
- [`src/config/admin-route-registry.ts`](../src/config/admin-route-registry.ts) — catálogo/redirects admin.
- [`src/config/admin-route-permissions.ts`](../src/config/admin-route-permissions.ts) — permiso mínimo por página.
- [`src/config/old-url-redirects.config.json`](../src/config/old-url-redirects.config.json) — redirects legacy usados por Next.
- [`next.config.mjs`](../next.config.mjs) — headers/CSP, redirects, imágenes y standalone.

## Backend and APIs

- [`src/app/api`](../src/app/api) — 56 route handlers.
- [`src/server`](../src/server) — servicios, repositorios e integraciones server-only.
- [`src/server/db/prisma.ts`](../src/server/db/prisma.ts) — cliente Prisma central.
- [`src/lib/validation/env.ts`](../src/lib/validation/env.ts) — validación/configuración de entorno.

## Cart and catalog

- [`src/components/commerce/add-to-cart-button.tsx`](../src/components/commerce/add-to-cart-button.tsx) — carrito en `localStorage`.
- [`src/server/checkout/cart-service.ts`](../src/server/checkout/cart-service.ts) — quote/revalidación operativa.
- [`src/features/catalog/product-catalog.ts`](../src/features/catalog/product-catalog.ts) — facade/tipos centrales.
- [`src/features/catalog/services/website-merchandising-service.ts`](../src/features/catalog/services/website-merchandising-service.ts) — visibilidad/categorías/placement.
- [`src/server/square/website-catalog-store.ts`](../src/server/square/website-catalog-store.ts) — proyección publicada Square + CMS.

## Checkout, orders and payments

- [`src/app/api/checkout/route.ts`](../src/app/api/checkout/route.ts) — orquestador checkout v1/split v2; P0.
- [`src/server/checkout/checkout-attempt-repository.ts`](../src/server/checkout/checkout-attempt-repository.ts) — idempotencia/correlación/estado.
- [`src/server/square/hosted-checkout.ts`](../src/server/square/hosted-checkout.ts) — Square Payment Link alojado.
- [`src/server/webhooks/shipping-payment-confirmation.ts`](../src/server/webhooks/shipping-payment-confirmation.ts) — evidencia payment/shipping.
- [`src/server/webhooks/split-checkout-payment-confirmation.ts`](../src/server/webhooks/split-checkout-payment-confirmation.ts) — evidencia split e ingesta OrderPRO.
- [`src/server/orderpro/paid-checkout-client.ts`](../src/server/orderpro/paid-checkout-client.ts) — orden pagada a OrderPRO.
- [`src/server/admin/admin-orders-analytics.ts`](../src/server/admin/admin-orders-analytics.ts) — lectura y analítica de órdenes espejo.

## Inventory and Square

- [`src/server/square`](../src/server/square) — cliente, sincronización, projection stores y webhooks.
- [`scripts/sync-square-postgres-read-only.ts`](../scripts/sync-square-postgres-read-only.ts) — sync PostgreSQL.
- [`scripts/sync-square-catalog-read-only.mjs`](../scripts/sync-square-catalog-read-only.mjs) — snapshot local read-only.
- [`src/app/api/internal/square/catalog-sync/route.ts`](../src/app/api/internal/square/catalog-sync/route.ts) — worker HTTP de sync.
- [`docs/square-integration.md`](./square-integration.md) — contrato y operación.

## Fulfillment, delivery and pickup

- [`src/features/fulfillment/contracts`](../src/features/fulfillment/contracts) — contratos compartidos.
- [`src/server/orderpro/storefront-fulfillment-client.ts`](../src/server/orderpro/storefront-fulfillment-client.ts) — pickup/delivery/capacity.
- [`src/server/orderpro/client.ts`](../src/server/orderpro/client.ts) — API local-delivery versionada.
- [`src/server/orderpro/orderpro-pickup-slot-service.ts`](../src/server/orderpro/orderpro-pickup-slot-service.ts) — slots pickup.
- [`src/server/orderpro/orderpro-local-delivery-service.ts`](../src/server/orderpro/orderpro-local-delivery-service.ts) — elegibilidad/quote local.
- [`docs/orderpro-integration.md`](./orderpro-integration.md) — integración.
- [`docs/slot-capacity.md`](./slot-capacity.md) — capacidad; distinguir scaffold local de autoridad OrderPRO.

## Shipping

- [`src/server/shipping/shipping-service.ts`](../src/server/shipping/shipping-service.ts) — Shippo rates/selection.
- [`src/server/orderpro/shipping-order-client.ts`](../src/server/orderpro/shipping-order-client.ts) — lifecycle shipping en OrderPRO.
- [`src/app/api/shipping`](../src/app/api/shipping) — capability y rate endpoints.
- [`docs/shipping.md`](./shipping.md), [`docs/orderpro-shipping-operations.md`](./orderpro-shipping-operations.md) — diseño/runbook.

## Returns and refunds

- [`src/components/returns/returns-portal.tsx`](../src/components/returns/returns-portal.tsx) — workflow cliente.
- [`src/app/api/returns`](../src/app/api/returns) — verificación, quote, RMA, evidence, label/status.
- [`src/server/returns/return-service.ts`](../src/server/returns/return-service.ts) — dominio.
- [`src/server/returns/return-repository.ts`](../src/server/returns/return-repository.ts) — persistencia.
- [`src/server/returns/shippo-return-label.ts`](../src/server/returns/shippo-return-label.ts) — labels Shippo.
- [`src/server/orderpro/returns-client.ts`](../src/server/orderpro/returns-client.ts) — autoridad Operations.
- [`docs/returns.md`](./returns.md) — contrato operativo.

## CMS, homepage and merchandising

- [`src/lib/cms`](../src/lib/cms) — documentos, schemas, registry, fallbacks y adapters.
- [`src/server/admin/website-merchandising-store.ts`](../src/server/admin/website-merchandising-store.ts) — versiones en CMS.
- [`src/server/admin/website-merchandising-publication.ts`](../src/server/admin/website-merchandising-publication.ts) — publish/rollback.
- [`src/features/homepage/components/homepage-template.tsx`](../src/features/homepage/components/homepage-template.tsx) — render homepage.
- [`src/features/homepage/components/admin/homepage-studio-editor.tsx`](../src/features/homepage/components/admin/homepage-studio-editor.tsx) — editor grande.
- [`src/components/admin/product-placement-manager.tsx`](../src/components/admin/product-placement-manager.tsx) — placement/import.

## Authentication and authorization

- [`src/server/admin/admin-security.ts`](../src/server/admin/admin-security.ts) — bootstrap legacy/cookies.
- [`src/server/admin/admin-session.ts`](../src/server/admin/admin-session.ts) — sesión y permisos.
- [`src/server/admin/admin-security.ts`](../src/server/admin/admin-security.ts) — bootstrap legacy y `authorizeAdminRequest` (RBAC API/same-origin).
- [`src/server/admin/identity`](../src/server/admin/identity) — identidad DB, TOTP, recovery, sessions y scopes.
- [`src/server/admin/admin-rate-limit.ts`](../src/server/admin/admin-rate-limit.ts) — limiter persistente.
- [`src/server/customers`](../src/server/customers) — cuenta passwordless y privacy.
- [`src/app/api/account`](../src/app/api/account) — endpoints de cuenta.
- [`docs/security.md`](./security.md) — referencia; contiene partes desactualizadas.

## Webhooks and workers

- [`src/app/api/webhooks/square/route.ts`](../src/app/api/webhooks/square/route.ts) — HMAC + inbox.
- [`src/app/api/webhooks/shippo/[secret]/route.ts`](../src/app/api/webhooks/shippo/[secret]/route.ts) — secret-path + inbox.
- [`src/server/webhooks`](../src/server/webhooks) — inbox, dispatch y handlers.
- [`src/app/api/internal/webhooks/process/route.ts`](../src/app/api/internal/webhooks/process/route.ts) — worker/retry/cleanup.
- [`infrastructure/production/systemd`](../infrastructure/production/systemd) — worker webhook; el sync vive en `infrastructure/hostinger/systemd`.

## Database

- [`prisma/schema.prisma`](../prisma/schema.prisma) — 56 modelos y enums.
- [`prisma/migrations`](../prisma/migrations) — 22 migraciones forward-only.
- [`infrastructure/postgres/bootstrap-storefront-roles.sql`](../infrastructure/postgres/bootstrap-storefront-roles.sql) — roles/grants/revokes.
- [`src/tests/unit/postgres-role-bootstrap.test.ts`](../src/tests/unit/postgres-role-bootstrap.test.ts) — contrato ACL ejecutable.
- [`docs/postgres-role-bootstrap.md`](./postgres-role-bootstrap.md) — runbook.

## External integrations

- Square: [`src/server/square`](../src/server/square), checkout y webhook.
- OrderPRO: [`src/server/orderpro`](../src/server/orderpro).
- Shippo: shipping/returns y webhook.
- Resend: identidad de cliente y notificaciones admin.
- Operations access: [`src/server/operations-access`](../src/server/operations-access) — adapter aún deshabilitado.
- Sentry: rutas internas de webhook/sync.
- Supabase: PostgreSQL administrado/ACL, sin SDK runtime.
- Mapbox: dependencia/config sin consumo runtime confirmado.

## Configuration and feature flags

- [`.env.example`](../.env.example) — catálogo de variables sin secretos.
- [`src/lib/validation/env.ts`](../src/lib/validation/env.ts) — parser/validación central parcial.
- [`src/config`](../src/config) — ubicaciones, holidays, routes, pages y fallbacks.
- [`next.config.mjs`](../next.config.mjs), [`tsconfig.json`](../tsconfig.json), [`tailwind.config.ts`](../tailwind.config.ts).
- Flags críticas: checkout Square, split checkout, fulfillment/shipping, identity mode, returns y acceso Operations.

## Infrastructure and deployment

- [`Dockerfile`](../Dockerfile) — builds separados migrations/sync/runner.
- [`infrastructure/production/compose.yml`](../infrastructure/production/compose.yml) — app/migrate/networks/volume.
- [`infrastructure/production/caddy`](../infrastructure/production/caddy) — ejemplos de reverse proxy/TLS para canary/final.
- [`infrastructure/production/systemd`](../infrastructure/production/systemd) y [`infrastructure/hostinger/systemd`](../infrastructure/hostinger/systemd) — worker y sync.
- [`infrastructure`](../infrastructure) — preflight, smoke, backup y rollout.
- [`docs/deployment.md`](./deployment.md), [`docs/vps-canary-runbook.md`](./vps-canary-runbook.md), [`docs/hostinger-real-catalog-runbook.md`](./hostinger-real-catalog-runbook.md).

## Scripts and CLI

- [`scripts`](../scripts) — sync, audit, bootstrap, publication, rollback, import, reconcile y release.
- Los scripts de bootstrap/import/compactación/reconcile pueden mutar datos y exigen revisar sus confirmaciones.
- Los scripts live de OrderPRO requieren configuración separada; no confundir con unit tests.

## Tests and quality

- [`src/tests/unit`](../src/tests/unit) — servicios, contratos, seguridad, config y componentes.
- [`src/tests/integration`](../src/tests/integration) — DB/API/integraciones con doubles o entornos dedicados.
- [`src/tests/e2e`](../src/tests/e2e) — Playwright desktop/mobile.
- [`vitest.config.ts`](../vitest.config.ts), configs live y [`playwright.config.ts`](../playwright.config.ts).
- [`.github/workflows`](../.github/workflows) — lint/type/test/Prisma/audit, PostgreSQL 17, build y Playwright.

## Highest-risk review order

1. Checkout route → cart service → attempt repository → hosted checkout.
2. Square webhook → inbox worker → payment confirmation → OrderPRO.
3. Admin identity/session/RBAC/rate limit.
4. PostgreSQL grants versus repos transaccionales.
5. Returns/Shippo and customer privacy.
6. Square catalog sync and publication.

## Known ambiguity / legacy shortlist

- `Cart`/`CartItem`, `WebhookEvent`, DeliveryZone/Slot* y tablas relacionales de merchandising.
- Writer externo de `OrderMirror` no identificado.
- Directorios App Router vacíos.
- Dependencias posiblemente no usadas: `@square/web-sdk`, `shippo`, `mapbox-gl`, `class-variance-authority`.
- `index.html` raíz como posible maintenance artifact de hosting.

No elimines ninguno basándote sólo en esta lista; revisa consumidores dinámicos, datos y sistemas externos.
