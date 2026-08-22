# StoreOnline → OrderPRO paid split checkout v1

## Decision

StoreOnline creates one Square Order and one Square payment. Square API-created orders can contain at most one fulfillment, so a mixed order does not use Square fulfillment as the operational source of truth. OrderPRO receives one paid checkout with one or two fulfillment groups and creates the employee work queues.

The executable StoreOnline schema is `src/features/checkout/orderpro-paid-checkout-contract.ts`.

## Endpoint OrderPRO must implement

`POST /api/internal/storefront/paid-checkouts`

Required headers:

- `Content-Type: application/json`
- `X-OrderPRO-Checkout-Key: <32+ byte shared secret>`
- `Idempotency-Key: square-payment:<squarePaymentId>`
- `X-Correlation-ID: checkout:<checkoutAttemptId>`

StoreOnline uses an 8-second timeout, refuses redirects, limits the response to 128 KiB, and validates the complete response.

## Request

Schema version: `orderpro.paid-checkout.v1`.

The request contains:

- StoreOnline checkout attempt ID.
- Authoritative Square order, payment, location, paid timestamp, currency, tax, discount, and total-paid evidence.
- Customer contact.
- One `regular` group, one `balloons` group, or both.
- Catalog variation IDs, names, and quantities for each group.
- Exact operational selection:
  - Pickup ASAP: `{ "timing": "ASAP" }`.
  - Scheduled pickup: date, slot ID/label, start, and end.
  - Local delivery: OrderPRO quote/slot, address, window, and fee.
  - Shipping: existing OrderPRO shipping reservation ID, Shippo rate, destination, ready date, and fee.
- Parent pricing from the paid Square order and tax allocated to each group from Square line-item tax evidence.

Balloon groups must reject `shipping` and pickup `ASAP` even if a bad client sends them.

## Required transactional behavior in OrderPRO

1. Authenticate the shared secret with constant-time comparison. Never log it.
2. Validate the exact schema and reject unknown fields.
3. Start one database transaction.
4. Claim the idempotency key and store a canonical request hash.
5. If the same key and hash already completed, return the original checkout with `replayed: true`.
6. If the same key has a different hash, return HTTP `409 IDEMPOTENCY_CONFLICT`.
7. Create or find one parent operational checkout keyed by both `checkoutAttemptId` and `squarePaymentId`.
8. Create one operational group per request group.
9. For `pickup + ASAP`, create a `NEW` task in employee queue `PICKUP_ASAP` immediately. `requestedFor` is null; `paidAt` and queue priority determine ordering.
10. For scheduled pickup, create `PICKUP_SCHEDULED` with the supplied window and validate the stored OrderPRO slot/hold.
11. For local delivery, create `LOCAL_DELIVERY`, consume/confirm the quote capacity hold, and preserve the address and delivery window.
12. For shipping, attach the existing reservation and transition it from pending payment to paid; do not create a duplicate shipping order.
13. Commit the parent, groups, tasks, tax snapshot, and idempotency result atomically.
14. Return HTTP 201 for a new checkout or 200 for an idempotent replay.

If a paid order cannot be fulfilled, do not discard it. Create the group with status `EXCEPTION`, surface it prominently to employees, and return a valid success response so webhook retries do not create duplicates.

## Response

```json
{
  "ok": true,
  "replayed": false,
  "checkout": {
    "id": "00000000-0000-4000-8000-000000000100",
    "status": "PAID",
    "checkoutAttemptId": "checkout_123",
    "squareOrderId": "square_order_123",
    "squarePaymentId": "square_payment_123",
    "groups": [
      {
        "id": "00000000-0000-4000-8000-000000000101",
        "groupKey": "regular",
        "status": "NEW",
        "employeeQueue": "PICKUP_ASAP"
      },
      {
        "id": "00000000-0000-4000-8000-000000000102",
        "groupKey": "balloons",
        "status": "NEW",
        "employeeQueue": "PICKUP_SCHEDULED"
      }
    ]
  }
}
```

## Suggested OrderPRO persistence

- `StorefrontPaidCheckout`: unique checkout attempt, Square order, and Square payment IDs; customer snapshot; parent totals; paid timestamp; status.
- `StorefrontPaidCheckoutGroup`: unique `(checkoutId, groupKey)`; mode; location; timing/window/address; group pricing; operational status.
- `StorefrontPaidCheckoutLine`: unique group/variation; quantity and display-name snapshot.
- Existing shipping reservation relation should be unique and nullable.
- Existing pickup/delivery capacity hold relations should be unique and nullable.
- `StorefrontCheckoutIngest`: idempotency key, canonical request hash, response snapshot, created/completed timestamps.

## Employee UX acceptance

- A paid regular ASAP pickup appears in `PICKUP_ASAP` without a fabricated time slot.
- A paid scheduled pickup shows date and exact window.
- Balloons never appear as shipping or ASAP.
- Mixed checkout groups share the same customer and Square payment reference but can progress independently.
- Search by Square order, Square payment, customer phone/email, or checkout attempt finds the parent and both groups.
- A failure in one group does not hide the other group; the parent shows `EXCEPTION` until resolved.

## Deployment order

1. Deploy OrderPRO migration, endpoint, employee queues, and idempotency tests with its feature gate off.
2. Configure the same `ORDERPRO_STOREFRONT_CHECKOUT_SHARED_SECRET` on both services.
3. Configure StoreOnline `ORDERPRO_STOREFRONT_CHECKOUT_BASE_URL` for the internal OrderPRO URL.
4. Certify Square sandbox payment webhook → OrderPRO ingest → employee queue, including replay.
5. Certify destination tax behavior for mixed shipping before production.
6. Enable the OrderPRO endpoint gate.
7. Set StoreOnline `SPLIT_CHECKOUT_ENABLED=true` only after all previous checks pass.

Do not enable the StoreOnline switch merely because the UI renders. It is intentionally fail-closed until the paid-order consumer and tax policy are ready.
