# Admin Guide

The admin now uses a controlled production control plane. Each admin route maps to a purpose-built module with declared editable fields, workflow actions, connected data models, guardrails, and a production checklist.

Admin sections include dashboard, homepage, navigation, departments, holidays, products, product placement, product display, product SEO, product images, balloons, delivery zones, pickup and delivery slots, locations, shipping, orders, fulfillment, theme settings, media library, users and roles, audit log, Square sync status, and webhook events.

Arbitrary CSS editing is excluded. Admins should choose controlled theme, layout, grid, and card presets.

The module catalog lives in `src/config/admin-control-plane.ts`. The shared editor lives in `src/components/admin/admin-module-editor.tsx`. The API endpoint at `/api/admin` validates submitted fields and prepares CMS versions. When `DATABASE_URL` is configured, production saves to `CmsContentVersion`; without it, local development persists versioned JSON snapshots under `data/admin-cms/` only when `ALLOW_LOCAL_PERSISTENCE_FALLBACK=true`.

For the complete operational handoff, local setup, release boundaries, and
troubleshooting steps, see [Phase 2 and CMS Handoff](phase-2-handoff.md).

## Authentication and password reset

Admin login requires `ADMIN_LOGIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and
`ADMIN_SESSION_SECRET`. Generate a replacement password hash with:

```bash
npm run admin:hash-password -- "new-long-password"
```

Store the new hash in an ignored local environment file or the deployment
secret manager, then restart or redeploy. Five failed attempts per IP and email
are allowed during a 15-minute window. Correct credentials do not consume or
remain blocked by the failed-attempt counter.

## CMS workflow

Business-facing content supports draft, preview, publish, unpublish, scheduled publish, scheduled unpublish, version history, rollback, audit log, and role-based permissions. Security, payment, and integration-critical code remains protected.

Editable business-facing content includes homepage content, homepage section order, hero banners, announcement bar, navigation labels and order, department pages, holiday pages, product web titles, product descriptions, product SEO, badges, visibility, image display order, product placement, balloon builder options, delivery zones, pickup and delivery slots, location pages, and theme presets.

The homepage editor also supports four editable promotional items in the hero.
Each item may be a normal card or an image cutout and may link to a brand,
website category, product, editable page, or manual URL. Hero height is
selectable as compact, standard, large, or fullscreen.

Publishing creates a new `PUBLISHED` version. The storefront never renders a
draft or preview version. If a successful publish is not visible, verify the
storage mode, database/fallback configuration, version history, admin session,
and storefront refresh using the checklist in the Phase 2 handoff.

## Website category hierarchy

Website categories support four total levels and are independent from Square
categories. The Product Placement Manager lets an admin create a main category
or nested subcategory, choose or change its parent, edit visibility and copy,
and reorder siblings. Cycles, missing parents, and branches deeper than four
levels are rejected in both the editor and backend validation.

## Product Placement Manager

The Product Placement Manager lets staff place Square products across website areas without changing Square categories or `reporting_category`. A single Square variation can appear in departments, holidays, balloon sections, homepage sections, product groups, search groups, and promo sections at the same time.

New Square products default to `NEEDS_PLACEMENT` or `NEEDS_REVIEW`. They do not publish automatically unless auto-publish is explicitly enabled later.

Placement rules are suggest-only by default. Admin approval is required before preview and publish.
