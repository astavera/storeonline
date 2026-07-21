# Phase 2 and CMS Handoff

Last verified: 2026-07-21

Implementation baseline: `ff68234`

This document is the operational handoff for the fulfillment, CMS, homepage,
catalog hierarchy, admin security, and OrderPRO work delivered after the Phase
1 handoff. It describes what is working now, how to run it, and which release
boundaries remain closed.

## Current status

| Area | Current state | Release boundary |
| --- | --- | --- |
| Admin authentication | Credential login, signed 8-hour session, origin checks, capabilities, and failed-login throttling are implemented. | Production still needs managed secrets and the final identity-provider decision. |
| Homepage CMS | Draft, preview, publish, version history, validation, and public homepage reads from the latest `PUBLISHED` version are implemented. | Production requires PostgreSQL persistence; local file persistence is development-only. |
| Storefront page builder | Department, holiday, landing, product, location, and content-page documents can be edited through the shared builder. | A published document replaces the code fallback only for its exact entity type and entity ID. |
| Homepage hero | Hero size, media, copy, buttons, alignment, visibility, and the four promotional items are editable. | Publishing is blocked when required links or cutout images are invalid. |
| Promotional items | Each of the four hero items supports `card` or transparent-image `cutout` presentation. | Cutouts require an uploaded or selected image before publish. |
| Homepage links | Link type can be brand, category, product, page, or manual URL. Available destinations come from website merchandising and editable storefront pages. | A destination must exist and pass the editor checks before publishing. |
| Website categories | Four total levels are supported: main category, subcategory, level 3, and level 4. | Cycles, missing parents, invalid moves, and branches deeper than four levels are rejected. |
| Balloon fulfillment gate | Local delivery asks only for a five-digit ZIP first. An approved OrderPRO response allows the shopper to continue to the selected balloon collection. | Full address, store assignment, fee, and final availability must be revalidated later in checkout. |
| Pickup and local-delivery services | Server-side contracts, validation, reason codes, date windows, routing helpers, capacity holds, and persistence models are present. | Current browser flows use test fixtures outside production; real operational slots and zones still require approved data. |
| OrderPRO M2M | A server-only, fail-closed Auth0 client can certify the STAGING `auth-check`. | Quote, hold, order submission, and production checkout release remain disabled. |
| Checkout | Catalog price, inventory, fulfillment compatibility, idempotency, and selections are validated without charging. | No Square payment is captured and no Square or OrderPRO order is created. |
| Square | Bounded catalog and inventory reads are available behind the production read-only switch. | Production writes, orders, payments, and inventory mutations remain disabled. |

## Run the application locally

Use Node 24.18.x and npm 11.

```bash
npm ci
cp .env.example .env.local
npm run admin:hash-password -- "choose-a-long-local-password"
```

Place the generated hash in the ignored `.env.local` file. A minimal local
admin and CMS setup is:

```dotenv
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3001
ADMIN_ALLOWED_ORIGINS=http://127.0.0.1:3001,http://localhost:3001
ADMIN_LOGIN_EMAIL=admin@example.test
ADMIN_PASSWORD_HASH=<generated-hash>
ADMIN_SESSION_SECRET=<random-secret-with-at-least-32-bytes>
ADMIN_DEV_BYPASS=false
ALLOW_LOCAL_PERSISTENCE_FALLBACK=true
ORDERPRO_M2M_AUTH_MODE=DISABLED
ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=false
```

Do not commit `.env`, `.env.local`, password hashes, session secrets, Square
tokens, or OrderPRO client credentials.

Start the requested local port:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open:

- Storefront: `http://127.0.0.1:3001/`
- Admin login: `http://127.0.0.1:3001/admin/login`
- Homepage editor: `http://127.0.0.1:3001/admin/homepage`

## Admin login and password reset

The login is fail-closed. All three variables below must be present:

- `ADMIN_LOGIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`

To reset the password:

1. Generate a new hash with `npm run admin:hash-password -- "new-password"`.
2. Replace only `ADMIN_PASSWORD_HASH` in the ignored environment file or the
   deployment secret manager. In a local Next.js environment file, escape each
   `$` in the generated hash as `\$` so environment expansion does not alter it.
3. Restart the local server or redeploy the application.
4. Sign in with `ADMIN_LOGIN_EMAIL` and the new plain-text password.

Failed credentials are limited to five attempts per IP and email during a
15-minute window. A correct credential check is not rejected by the failed
attempt counter. Local in-memory buckets are cleared when the development
server restarts; production buckets use PostgreSQL.

## Homepage CMS workflow

The homepage editor uses the `homepage` admin module and persists versioned
payloads containing sections, photo presets, header navigation, SEO metadata,
and the change summary.

Recommended workflow:

1. Open `/admin/homepage` and select desktop, tablet, or mobile preview.
2. Edit the section content, design, media, navigation, SEO, or visibility.
3. Open **Checks** and resolve every required error.
4. Use **Save draft** for unfinished work or **Preview** for a preview version.
5. Use **Publish** and wait for the success state. Do not close the page while
   it says `Publishing...`.
6. Open `/` in a fresh tab and perform a hard refresh.

The public homepage reads only the newest `PUBLISHED` version. Draft and
preview versions never replace the live homepage.

### Hero controls

The hero supports these sizes:

- `compact`
- `standard`
- `large`
- `fullscreen`

The four promotional items support:

- Presentation: `card` or `cutout`.
- Destination: brand, category, product, page, or manual link.
- Editable label, title, description, tone, image, and link.
- Destination dropdowns built from current and future website merchandising
  records as those records are created.

A cutout is the image itself without the full text card treatment. Transparent
WebP or PNG assets give the expected result. The editor refuses to publish a
cutout with no image.

### If Publish succeeds but the homepage does not change

Check these items in order:

1. Confirm the editor reports a successful persisted version, not
   `validated-only` or an expired admin session.
2. Confirm the editor and storefront use the same `DATABASE_URL` or the same
   explicit development fallback.
3. For local file persistence, confirm both requests run with
   `NODE_ENV=development` and `ALLOW_LOCAL_PERSISTENCE_FALLBACK=true`.
4. Confirm the version history shows a new `PUBLISHED` version for entity ID
   `homepage`.
5. Reload `/` after the publish response finishes. The publish API revalidates
   `/` and `/admin/homepage`.
6. Check the server console for `PERSISTENCE_UNAVAILABLE`; production and
   preview never silently fall back to local JSON.

## Storefront page builder

When a scope and entity ID are selected from the homepage editor, the shared
builder saves through `/api/admin/cms` using one of these operations:

- `save_draft`
- `preview`
- `publish`

Documents are validated before persistence. In PostgreSQL they are stored as
versioned `CmsContentVersion` records. The explicit local development fallback
stores versioned JSON snapshots under `data/admin-cms/`.

The storefront reads the newest published document for the exact page entity.
If none exists, it renders the code-defined fallback page.

## Four-level category hierarchy

Website categories are independent from Square categories and Square
`reporting_category`.

Supported hierarchy:

```text
Main category
└── Subcategory 1
    └── Subcategory 1.1
        └── Subcategory 1.1.1
```

From Product Placement Manager, an admin can create a category, choose its
parent, move it within the valid tree, set visibility, edit its website copy,
and reorder it among siblings. Parent choices that would exceed four levels
are hidden. The backend validates the same rules and rejects cycles or missing
parents.

Hiding an ancestor also makes its descendants unavailable on the storefront.
A category with children cannot be removed until those children are moved or
removed.

## Balloon local-delivery flow

The shopper flow is intentionally progressive:

1. Select a balloon collection.
2. Choose **Local delivery** or **Store pickup**.
3. For local delivery, enter only a five-digit ZIP.
4. The server asks the OrderPRO eligibility boundary.
5. If approved, the browser stores the short-lived approval in session storage
   and continues to `/shop` with the selected balloon collection.
6. Checkout must later collect and revalidate the full address, store, fee,
   date, and slot before any future payment step.

Development currently uses mock eligibility for ZIP codes `10021`, `10028`,
`10065`, `10075`, and `10128`. These are test fixtures, not the final approved
production service area.

The production checkout gate remains closed in code. Setting
`ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED=true` alone does not release it.

## OrderPRO STAGING

Keep every OrderPRO credential server-only. The supported live certification
is limited to:

```bash
npm run test:orderpro:live -- --auth-check
```

Before enabling the M2M client in a secure environment, configure the values
documented in `.env.example` and `docs/orderpro-integration.md`. Never prefix a
credential with `NEXT_PUBLIC_` and never place it in a CMS document.

## Persistence policy

- With `DATABASE_URL`, CMS, admin rate limiting, holds, evaluations, and
  checkout attempts use PostgreSQL.
- Without a database, local JSON persistence is allowed only when both
  `NODE_ENV=development` and `ALLOW_LOCAL_PERSISTENCE_FALLBACK=true`.
- Preview and production fail closed if durable persistence is unavailable.

## Verification baseline

The implementation baseline was verified with:

```bash
npm run lint
npm run lint:orderpro
npm run typecheck
npm run test
```

Results on 2026-07-21:

- ESLint: 0 errors; 44 non-blocking warnings within the current budget.
- TypeScript and Next.js route generation: passed.
- Vitest: 64 files passed, 3 skipped; 256 tests passed, 5 skipped.
- Staged credential audit: no production tokens, private keys, admin secrets,
  or non-placeholder database credentials.

## Known limitations and next gates

- Payment capture and Square order creation are not implemented.
- OrderPRO local-delivery checkout is deliberately unreleased.
- Mock ZIPs, addresses, fees, and empty slot fixtures are not production data.
- Production polygons, fees, schedules, holidays, capacity, lead times, and
  mixed-cart policy still require owner approval.
- The final production admin identity provider and secret-management process
  remain platform work.
- Run full desktop and mobile browser acceptance after real operational data is
  connected and before enabling checkout.

## Related documents

- [Admin guide](admin-guide.md)
- [Phase 2 implementation plan](phase-2-implementation-plan.md)
- [Master roadmap](MASTER_ROADMAP.md)
- [OrderPRO integration](orderpro-integration.md)
- [Balloon delivery pricing policy](balloon-delivery-pricing-policy.md)
- [Delivery zones](delivery-zones.md)
- [Slot capacity](slot-capacity.md)
- [Security](security.md)
- [Deployment](deployment.md)
