# Online returns

## Scope and launch status

The `/returns` route is the storefront experience for verified order lookup,
server-authoritative eligibility, RMA creation, private return documents, and
status tracking. It is intentionally **not production-ready** until the launch
gate at the end of this document has been completed.

## Ownership

- The storefront owns the five-step customer experience, short-lived verified
  session, policy calculation, accepted Shippo quote snapshot, private document
  proxy, and an auditable local RMA mirror.
- OrderPRO verifies the customer challenge, supplies the trusted order and
  carrier-delivery snapshot, evaluates evidence, creates the idempotent RMA,
  performs receipt and inspection, and owns every inventory disposition.
- Shippo quotes and purchases the configured return service and reports carrier
  tracking. A Shippo `DELIVERED` event maps only to `DELIVERED_TO_WH01`.
- Square issues one linked, idempotent refund to the original payment after
  OrderPRO inspection. Production Square writes remain blocked.
- `WH01` is the only configured mail-return destination.

## Security and data flow

1. The browser submits order number, email, and ZIP. The public endpoint returns
   the same generic response for a matching or non-matching lookup.
2. OrderPRO emails and verifies the challenge. Only then does the storefront
   issue a 30-minute random token in an `HttpOnly`, `SameSite=Strict` cookie.
3. OrderPRO supplies the trusted delivery timestamp, quantities, payment
   correlation, structured catalog policy attributes, package data, and
   customer return address. The browser never supplies authoritative money,
   payer, eligibility, or evidence decisions.
4. Quote acceptance is signed with `RETURNS_SESSION_SECRET`. On submit, the
   storefront reloads the verified session, asks OrderPRO for a fresh evidence
   preview, recalculates the policy, and revalidates the exact Shippo rate.
5. OrderPRO creates the RMA under the browser's idempotency key. The local
   database claims the label purchase atomically so a retry cannot buy a second
   active label.
6. Label and packing-slip routes require the verified session and RMA ownership.
   Shippo URLs and API tokens are never returned to the browser.

Lookup and upload attempts are rate-limited by hashed request identity. Logs
record event names and sanitized failure codes, not raw order lookup data.

## OrderPRO private contract

The configured OrderPRO base URL must implement these authenticated routes:

- `POST /api/internal/storefront/returns/verification/start`
- `POST /api/internal/storefront/returns/verification/confirm`
- `POST /api/internal/storefront/returns/preview`
- `POST /api/internal/storefront/returns/evidence`
- `POST /api/internal/storefront/returns/create`
- `POST /api/internal/storefront/returns/status`
- `POST /api/internal/storefront/returns/inventory-event`

Requests use `x-orderpro-returns-key`; RMA creation and inventory events also
carry idempotency keys. See `src/server/orderpro/returns-client.ts` for the
strict schemas. Evidence/RMA email dispatch is reported by OrderPRO and must be
verified in the external acceptance test.

OrderPRO posts the inspection result to
`POST /api/internal/returns/inspection` with the same shared secret. Inspection
lines include the approved quantity and one of `AVAILABLE_ONLINE`, `DAMAGED`,
`QUARANTINED`, or `MANUAL_REVIEW`.

## Policy and catalog data

The policy uses carrier delivery day as day zero in
`RETURNS_BUSINESS_TIME_ZONE`; day 15 is eligible and day 16 is not. A missing
delivery date creates `MANUAL_REVIEW`.

The trusted snapshot uses:

- `WebsiteBrand.returnable`
- `ProductOverride.finalSale`
- `ProductOverride.returnPolicyTags`
- `ProductOverride.packageLengthIn`, `packageWidthIn`, `packageHeightIn`, and
  `packageWeightLb`

Supported policy tags include `HOLIDAY`, `SEASONAL`, `PARTY`,
`INTIMATE_APPAREL`, `COSMETIC`, `PERSONAL_CARE`, `HYGIENE`, `HEALTH`, `SEALED`,
`BODY_CONTACT`, and `PERSONALIZED`. OrderPRO must derive these values from
stable catalog IDs/attributes, never visible names.

If package data or an allowed company-paid rate is unavailable, the RMA remains
`LABEL_PENDING` for audited review. A customer-paid request cannot be accepted
without an exact, expressly accepted label deduction.

## Tracking, inspection, refund, and inventory

Shippo webhooks enter through
`POST /api/webhooks/shippo/{SHIPPO_WEBHOOK_SECRET}`. The secret must be at least
32 random characters and the configured public URL should additionally use
Shippo's documented IP allowlist where the deployment supports it. Events are
durably deduplicated before a background worker maps:

- `TRANSIT` → `IN_TRANSIT`
- `DELIVERED` → `DELIVERED_TO_WH01`
- `FAILURE` or `RETURNED` → `EXCEPTION`

Carrier events cannot advance the RMA to `RECEIVED`, `INSPECTING`, `APPROVED`,
or a refund status. Delayed tracking events also cannot regress a warehouse or
refund state.

OrderPRO must record `RETURNED` and place received units into `RETURN_STAGED` or
`QUARANTINED` before inspection. It must not increase available inventory at
carrier delivery. After inspection it owns `PUTAWAY`/`AVAILABLE_ONLINE`,
`DAMAGED`, `QUARANTINED`, or `MANUAL_REVIEW`.

The storefront prorates only approved merchandise and tax, adds original fees
only for an approved company-error return, and subtracts the accepted
customer-paid label exactly once. Square receives the original `paymentId`.
`REFUNDED` is written only when Square returns `COMPLETED`; other nonterminal
statuses remain `REFUND_PENDING`.

## Environment

Use `.env.example` as the canonical list. All Shippo, OrderPRO, session, worker,
and Square values are server-only. In addition to database and existing Square
configuration, returns require:

- `ORDERPRO_RETURNS_ENABLED=true`
- `ORDERPRO_STOREFRONT_PREVIEW_BASE_URL`
- `ORDERPRO_STOREFRONT_RETURNS_SHARED_SECRET`
- `RETURNS_SESSION_SECRET`
- `RETURNS_BUSINESS_TIME_ZONE`
- `SHIPPO_API_TOKEN`
- `SHIPPO_TEST_MODE`
- `SHIPPO_ALLOWED_RETURN_CARRIERS`
- `SHIPPO_DEFAULT_RETURN_SERVICE`
- every `SHIPPO_RETURN_ADDRESS_*` value for WH01
- `SHIPPO_WEBHOOK_SECRET`
- `WEBHOOK_WORKER_SECRET`
- `SQUARE_RETURNS_REFUNDS_ENABLED`

## Launch gate

Do not enable production returns until all of the following have documented
evidence:

1. Apply `20260730133000_returns_portal` to an isolated preview database and
   verify rollback/restoration from backup.
2. Complete an OrderPRO verification, evidence decision, RMA retry, receipt,
   inspection, email, and inventory-disposition scenario.
3. Buy and download a Shippo test label, deliver repeated signed/secret-path
   webhook payloads, and verify carrier delivery stops at
   `DELIVERED_TO_WH01`.
4. Scan the generated RMA packing slip and physically receive a test package at
   WH01; verify `RETURN_STAGED` or `QUARANTINED` before disposition.
5. Approve full, partial, and rejected inspections and verify Square Sandbox
   refunds the original payment exactly once, including the accepted label
   deduction.
6. Reconcile OrderPRO, the storefront mirror, Shippo, Square, and available
   inventory; complete accessibility and mobile browser acceptance.
7. Keep `SQUARE_RETURNS_REFUNDS_ENABLED=false` and
   `ORDERPRO_RETURNS_ENABLED=false` in production until sign-off.
