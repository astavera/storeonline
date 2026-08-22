# Store Admin master plan implementation

Status: approved and implemented on 2026-08-19. External writes remain feature-gated until their authoritative providers are certified.

## Ownership boundaries

| System | Authoritative responsibilities | Store Admin behavior |
| --- | --- | --- |
| Square | Prices, inventory, final taxes, payments, financial discounts, refunds and disputes | Read-only status, reporting and safe deep links |
| Operations / OrderPro | Fulfillment queues, pickup, delivery, warehouse, shipping execution, slots and capacity | Read-only operational status, SSO/deep link and centrally requested access assignments |
| Shippo | Rates, labels and tracking | Configuration health and sanitized shipment status |
| Store Admin | Website content, merchandising, policies, customer support views, admin identities, authorization, audit and reporting | Authoritative editor and control plane |

The Store Admin must never report an external mutation or access assignment as
successful until the authoritative system confirms it.

## Human Store Admin roles

- `OWNER`: complete Store Admin control and the only role allowed to grant or revoke Operations access.
- `MANAGER`: manages catalog, content, customers, returns, reporting and non-sensitive settings.
- `MERCHANDISER`: manages website catalog presentation and placement without Square price or inventory writes.
- `MARKETING_CONTENT`: manages storefront content, SEO, campaigns, media and notification drafts.
- `CUSTOMER_SUPPORT`: reads customers, orders and fulfillment status; manages return cases and operational notes.
- `ANALYST_VIEWER`: read-only dashboard, catalog, audit, integration health and reporting access.

Operations roles remain externally owned: `OPERATIONS_MANAGER`, `STORE_STAFF`,
`FULFILLMENT`, `DELIVERY`, and `WAREHOUSE`. A Store Admin user may request one
of these assignments with a location scope, but Operations must confirm it.

## Current Operations contract boundary

The currently certified OrderPro M2M contract is STAGING-only and grants exactly
`local-delivery:holds` and `local-delivery:quote`. It does not expose identity,
role assignment, session revocation or SSO provisioning endpoints.

Until an approved Operations identity contract exists:

- access sync remains `UNAVAILABLE` or `PENDING`, never `ACTIVE`;
- the admin may provide a safe deep link using `ORDERPRO_ADMIN_URL`;
- no direct cross-application database access is allowed;
- no existing local-delivery M2M scope is reused for identity management.

## Delivery stages

1. Route inventory, authority registry, migration plan and external contracts.
2. Database-backed admin identities, RBAC, MFA, revocable sessions and location scope.
3. Operations access adapter, confirmed sync states, SSO/deep-link boundary, audit and integration health.
4. Action dashboard and permission-scoped global search.
5. Customer support directory and return case management.
6. Shipping/delivery configuration health and operational notifications.
7. CMS-backed promotional content visibility and local-mirror analytics. Financial discounts remain in Square.
8. Navigation, SEO, media and privacy operations.
9. Security, accessibility, migration, rollback and end-to-end release verification.

Every stage requires server-side authorization, auditability, explicit failure
states, focused tests and a rollback path before it is considered complete.

## Implemented Admin surfaces

- Permission-aware Overview and global search across products, orders, customers, and CMS pages.
- Commerce: Products with Catalog and Website publishing tabs; Orders with Orders and Returns tabs; and Customers. The former Inventory page redirects to Overview; Square remains the stock authority.
- Storefront: one Website Editor with Pages & homepage, controlled Navigation & SEO, and Media tabs.
- Marketing: CMS-backed Promotions remains an independent page alongside read-only Analytics.
- Operations: a global header handoff to `https://operation.modernstate.com` plus exact Operations access requests from Users & Roles; fulfillment is not duplicated in the sidebar.
- Store settings dropdown: Business details, Locations, Taxes, Legal & policies, and Shipping & delivery.
- System dropdown: Users & Roles, Audit log, Integration health, Webhook events, and Message templates.
- Header notification bell: at most 20 capability-filtered Storefront events from the redacted Audit Log, with a per-user last-seen marker and no polling.

Both dropdowns use text-only child links. `/admin/locations` redirects to the
single canonical editor at `/admin/settings?area=locations`. All generic legacy
routes now redirect to Products, Orders, Website Editor, Shipping, or Operations;
the route registry contains no generic placeholder.

## Release gates

1. Apply `20260819223000_admin_identity_foundation`, `20260819234500_customer_privacy_workflows`, and `20260820001500_admin_storefront_notifications` in order using the migrator role after a verified backup.
2. Rerun `bootstrap-storefront-roles.sql` after the migrations and require `verify-storefront-roles.sql` to pass before the runtime receives the reviewed Store Admin ACL.
3. Invite and activate the first Owner with MFA, retain recovery codes offline, then change `ADMIN_IDENTITY_MODE` from `LEGACY_BOOTSTRAP` to `DATABASE`.
4. Keep `OPERATIONS_ACCESS_SYNC_MODE=DISABLED` until Operations certifies `ACCESS_ASSIGNMENTS_V1`; access must remain `UNAVAILABLE`, never inferred `ACTIVE`.
5. Keep `ADMIN_TRANSACTIONAL_NOTIFICATION_PROVIDER=DISABLED` until the Resend sender, API key, recipient-HMAC pepper, and test delivery are verified.
6. Keep checkout, delivery, shipping, indexing, and other customer-impacting switches disabled during the private canary.
7. Verify role matrices, MFA/session revocation, audit CSV redaction, privacy export, navigation publish/rollback, media persistence, webhook retry, and mobile/keyboard accessibility before promotion.

Application rollback points the release symlink to the prior immutable build;
it does not automatically reverse database migrations. Privacy deletion
requests are review records only and never erase Square, Operations, payment,
or legally retained records automatically.

## Explicit exclusions

The implementation does not add direct price or inventory editing, a tax or
payment engine, refund or chargeback execution, duplicate fulfillment queues,
full email marketing automation, purchase orders, internal inventory transfers,
multi-currency, international markets, translations, B2B, wholesale,
subscriptions, a marketplace, free-form CSS/code editing, generic placeholder
modules in navigation, a second Locations editor, or direct Operations database
access.
