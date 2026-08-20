# Reservable checkout sandbox rollout

This runbook connects StoreOnline to OrderPRO for pickup, local delivery,
shipping, and mixed checkout. It does not authorize a production rollout.
All gates remain disabled by default in Git.

## Ownership

- StoreOnline owns the cart, checkout UI, one Square order, and one Square payment.
- OrderPRO owns quotes, temporary capacity holds, shipping reservations, paid
  checkout intake, and employee queues.
- Supabase/Postgres stores application data. It is not the place for the
  server-to-server credentials below.
- The VPS secret store injects credentials into the two containers. Never use
  `NEXT_PUBLIC_` variables for these values and never commit their values.

## Sandbox authentication

The Square sandbox uses `SHARED_SECRET` only while OrderPRO explicitly runs as
`STAGING` with `ORDERPRO_M2M_AUTH_MODE=DISABLED`. Each endpoint has a different
random value of at least 32 bytes:

- `ORDERPRO_STOREFRONT_PICKUP_QUOTE_SHARED_SECRET`
- `ORDERPRO_STOREFRONT_PICKUP_RESERVATION_SHARED_SECRET`
- `ORDERPRO_STOREFRONT_DURABLE_QUOTE_SHARED_SECRET`
- `ORDERPRO_STOREFRONT_WALKING_RESERVATION_SHARED_SECRET`
- `ORDERPRO_STOREFRONT_CAPACITY_CHECKOUT_SHARED_SECRET`
- `ORDERPRO_STOREFRONT_CHECKOUT_SHARED_SECRET`

The same named value must be injected into the StoreOnline and OrderPRO sandbox
containers. Use the deployment's protected Compose environment or secret file;
do not place values directly in `compose.yml`.

Production must use `ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE=AUTH0` with the
least-privilege scopes documented in `.env.example`. An incomplete or invalid
Auth0 configuration fails closed and never falls back to a shared secret.

## Deployment with every gate closed

1. Back up both sandbox databases and record the currently running image tags.
2. Build and deploy the new OrderPRO and StoreOnline images.
3. Run the pending StoreOnline and OrderPRO migrations against sandbox only.
4. Inject all six matching secrets, while leaving every `*_ENABLED` variable
   below set to `false`.
5. Confirm both `/api/health` endpoints are healthy and verify the rendered
   Compose configuration contains no literal credential.

Required StoreOnline connection values in the Docker sandbox are already wired
to the private service name:

```dotenv
ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL=http://orderpro-square-sandbox:3000
ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE=SHARED_SECRET
ORDERPRO_STOREFRONT_CHECKOUT_BASE_URL=http://orderpro-square-sandbox:3000
```

## Activation order

Activate one capability at a time and continue only when its checks are green.

### A. Scheduled pickup

Enable on OrderPRO sandbox:

```dotenv
ORDERPRO_SANDBOX_PICKUP_QUOTE_ENABLED=true
ORDERPRO_SANDBOX_PICKUP_RESERVATION_ENABLED=true
ORDERPRO_SANDBOX_CAPACITY_CHECKOUT_WRITES_ENABLED=true
ORDERPRO_SANDBOX_PAID_CHECKOUT_ENABLED=true
```

Keep StoreOnline checkout flags false while probing quote, reserve, bind,
release, paid intake, exact replay, and idempotency conflict directly. Then
enable:

```dotenv
STOREFRONT_SPLIT_CHECKOUT_ENABLED=true
```

Certify pickup ASAP and scheduled pickup separately. ASAP must create no hold;
scheduled pickup must create and bind one hold.

### B. Local delivery

After pickup remains green, enable on OrderPRO sandbox:

```dotenv
ORDERPRO_SANDBOX_DURABLE_QUOTE_ENABLED=true
ORDERPRO_SANDBOX_WALKING_RESERVATION_ENABLED=true
ORDERPRO_SANDBOX_GEOSPATIAL_PROVIDER_CALLS_ENABLED=true
```

Confirm the sandbox routing provider is healthy before enabling StoreOnline:

```dotenv
STOREFRONT_ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=true
```

Certify eligible and ineligible addresses, quote replay, capacity conflict,
abandoned checkout release, and a paid delivery.

### C. Shipping

After local delivery remains green, enable the existing OrderPRO shipping
sandbox reservation gates:

```dotenv
ORDERPRO_SANDBOX_SHIPPING_CHECKOUT_ENABLED=true
ORDERPRO_SANDBOX_SHIPPING_WRITES_ENABLED=true
STOREFRONT_ORDERPRO_SHIPPING_CHECKOUT_ENABLED=true
```

Certify that paid intake links the existing reservation and never creates a
second shipping order.

### D. Balloons and mixed checkout

With the prior paths green, certify:

- balloons + scheduled pickup;
- balloons + local delivery;
- rejection of balloons + pickup ASAP;
- rejection of balloons + shipping;
- regular pickup ASAP + balloons scheduled pickup;
- regular shipping + balloons local delivery;
- one Square payment, one parent checkout, and one task per group.

For every paid failure, verify OrderPRO creates an employee-visible `EXCEPTION`
instead of discarding the group.

## Required green evidence

- StoreOnline typecheck, focused tests, lint, and production build.
- OrderPRO Prisma validation, typecheck, focused tests, lint, and production build.
- New payment returns `201`; exact webhook replay returns `200` with
  `replayed: true`; changed payload for the same payment returns `409`.
- No Square payment link is created when a required reservation fails.
- Abandoned checkout checks Square twice before releasing holds.
- Feature flags and secrets are absent from client-side JavaScript and logs.
- Employee queues show `PICKUP_ASAP`, `PICKUP_SCHEDULED`, `LOCAL_DELIVERY`,
  `SHIPPING`, and `EXCEPTION` as applicable.

## Rollback

1. First set the three StoreOnline gates to `false` to stop new split,
   local-delivery, and shipping checkouts.
2. Keep OrderPRO paid intake and settlement endpoints available while existing
   Square payment links and queued webhooks drain.
3. Reconcile all open checkout attempts against Square. Never release a hold
   solely because a webhook is delayed.
4. After the in-flight set is empty, disable the OrderPRO quote, reservation,
   capacity-write, shipping-write, and paid-checkout gates.
5. Preserve checkout, idempotency, and exception records. Do not roll back a
   data migration destructively; deploy the previous application images only
   if their schema remains forward-compatible.
6. Re-run health checks and confirm no new reservable checkout can start.

Secret rotation is separate from rollback: deploy matching new values to both
containers together, restart them, verify health, and then revoke the old
deployment values.
