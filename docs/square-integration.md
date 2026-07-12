# Square Integration

## Source of truth

Square remains the source of truth for catalog items, variations, prices, inventory, orders, payments, taxes, business reporting, and existing Square categories.

## Read-only website policy

- Do not mutate `reporting_category`.
- Do not restructure Square categories for website navigation.
- Do not change Square prices unless explicitly approved.
- Do not change Square inventory counts unless explicitly approved.
- Use website departments and holiday assignments in the app database.

## Server-only implementation

Initial server-only helpers live in `src/server/square/client.ts`.

- `getSquareRuntimeConfig()` exposes only safe booleans and environment state.
- `assertSquareWriteAllowed()` blocks writes outside Sandbox.
- Webhook signature verification lives in `src/server/square/webhook-signature.ts`.

## MCP note

The Square MCP in `.codex/config.toml` is configured with `DISALLOW_WRITES=true`, but also `PRODUCTION=true`. For this milestone I inspected Square service metadata only and did not run a production catalog/location audit. A real read-only audit should be run against Sandbox first, or against production only after explicit approval.

## Next implementation

1. Configure Square Sandbox credentials.
2. Sync locations, catalog objects, variations, images, taxes, modifiers, and inventory into local cache tables.
3. Build order creation behind idempotency keys.
4. Process payment tokens server-side through Square Payments API.
5. Store webhook event IDs and process catalog/inventory/order/payment changes asynchronously.
