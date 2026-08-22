# Admin Guide

The Admin navigation exposes only purpose-built modules connected to real domain data. Retired generic routes redirect to their canonical workspace and no placeholder remains in navigation.

Current navigable sections include Overview; Products, Orders and Customers; Website Editor; Promotions and Analytics; Store settings; and System. Catalog Publishing is a Products tab, Returns is an Orders tab, and Navigation & SEO plus Media are Website Editor tabs. Promotions intentionally remains an independent page. Inventory remains Square-owned and has no Store Admin page.

Store settings contains text-only child links for Business details, Locations,
Taxes, Legal & policies, and Shipping & delivery. System contains text-only
links for Users & Roles, Audit log, Integration health, Webhook events, and
Message templates. Each parent is shown only when at least one child is
authorized.

The header always reserves the notification bell for real Storefront activity.
It reads a capability-filtered, redacted Audit Log feed and never polls. The
Operations button opens `https://operation.modernstate.com`; fulfillment is not
duplicated inside Store Admin.

Arbitrary CSS editing is excluded. Admins should choose controlled theme, layout, grid, and card presets.

The module catalog lives in `src/config/admin-control-plane.ts`. The shared editor lives in `src/components/admin/admin-module-editor.tsx`. The API endpoint at `/api/admin` validates submitted fields and prepares CMS versions. When `DATABASE_URL` is configured, production saves to `CmsContentVersion`; without it, local development persists versioned JSON snapshots under `data/admin-cms/` only when `ALLOW_LOCAL_PERSISTENCE_FALLBACK=true`.

For the complete operational handoff, local setup, release boundaries, and
troubleshooting steps, see [Phase 2 and CMS Handoff](phase-2-handoff.md).

## Authentication and password reset

The migration-only owner bootstrap requires `ADMIN_LOGIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and
`ADMIN_IDENTITY_MODE=LEGACY_BOOTSTRAP`. It no longer grants a wildcard
capability. Generate a replacement bootstrap password hash with:

```bash
npm run admin:hash-password -- "new-long-password"
```

Store the new hash in an ignored local environment file or the deployment
secret manager, then restart or redeploy. Five failed attempts per IP and email
are allowed during a 15-minute window. Correct credentials do not consume or
remain blocked by the failed-attempt counter.

Production users are invited from Users & Roles. Activation requires a
12-character password, TOTP enrollment, and recovery-code acknowledgement.
After the first Owner activates, set `ADMIN_IDENTITY_MODE=DATABASE` and provide
`ADMIN_MFA_ENCRYPTION_KEY` plus `ADMIN_RECOVERY_CODE_PEPPER`. Database sessions
are opaque, hashed at rest, idle-limited, absolutely expiring, and immediately
revocable. Suspending a user or changing its authorization version invalidates
existing sessions.

The production runtime example represents this database-backed steady state;
use legacy mode only during the first-Owner bootstrap window. The production
login lets staff choose either a six-digit authenticator code or a one-time
recovery code. It keeps account errors generic, verifies same-origin requests,
applies attempt limits, and issues only `HttpOnly`, `SameSite=Strict`, secure
production cookies. If the page says Admin access is not configured, verify the
database URL, the exact 32-byte base64url MFA encryption key, the independent
recovery-code pepper, and an active MFA-enrolled Owner before opening access.

Database-backed password recovery is available at `/admin/forgot-password`.
It uses a generic response so account existence is not disclosed, stores only
a SHA-256 token hash, expires links after 30 minutes, permits one use, and
revokes every existing Admin session after a successful reset. Configure
`ADMIN_PUBLIC_URL` with the exact HTTPS Admin origin,
`ADMIN_PASSWORD_RESET_EMAIL_FROM` with a verified sender, and `RESEND_API_KEY`.
The reset changes only the password; the user must still provide TOTP or an
unused recovery code at sign-in.

Store Admin roles and Operations roles are separate. Only an Owner can request
Operations access. The UI shows `ACTIVE` only after the external Operations API
confirms the exact user, role, and locations; without that contract it shows
`UNAVAILABLE` and provides only the safe Operations handoff.

## Customer privacy and support

Customers exposes only the minimum support profile, consent history, and
locally matched order/return counts. Authorized support roles may add internal
notes. Only an Owner with `customers:privacy.manage` can download the bounded
local-data export or create and resolve a deletion review request. Exports omit
sessions, challenges, payment data, internal notes, and external records that
are not mirrored locally. A deletion request never deletes data automatically;
the Owner must review legal retention and coordinate Square and Operations.

## Promotions, analytics, media, and message templates

Promotions detects real campaign sections in CMS versions and sends editors to
the Website Editor. It never creates coupons or financial discounts. Analytics
uses local order/return mirrors, marks net/refund coverage partial, and does not
invent COGS, margin, attribution, or unmirrored Square refunds. Media supports
raster uploads, alt text, and web visibility, but no destructive deletion.
Message templates stores versioned transactional templates and remains unable to
send until `ADMIN_TRANSACTIONAL_NOTIFICATION_PROVIDER=RESEND` and all provider
credentials are configured.

## CMS workflow

Business-facing content supports draft, preview, publish, unpublish, scheduled publish, scheduled unpublish, version history, rollback, audit log, and role-based permissions. Security, payment, and integration-critical code remains protected.

Editable business-facing content includes homepage content, homepage section order, hero banners, announcement bar, navigation labels and order, department pages, holiday pages, product web titles, product descriptions, product SEO, badges, visibility, image display order, product placement, and balloon builder options. Locations and legal documents use their canonical Store settings editors. Delivery zones, pickup/delivery slots, fulfillment, and capacity remain owned by Operations.

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

## Website publishing

The Website publishing tab inside Products lets staff place Square products across website areas without changing Square categories or `reporting_category`. A single Square variation can appear in departments, holidays, balloon sections, homepage sections, product groups, search groups, and promo sections at the same time.

The Catalog tab lists every synchronized production variation. Use **Manage** to
open the complete product record. The left column is the read-only Square source:
item and variation IDs, SKU/UPC, price, inventory, vendor, category, image, and
description. The right column contains the website-owned fields:

- publication state and readiness checklist;
- website title, product URL, badge, image URL and accessible alt text;
- short and full descriptions plus SEO title and description;
- website categories, brands, surfaces, fulfillment modes, age ranges, order,
  and holiday campaign dates.

Blank website content fields continue using their synchronized Square value.
Publishing is blocked until the product has an enabled website category, a
surface, a fulfillment mode, a real image, usable description, and alt text for
any website-specific image. Price and inventory remain editable only in Square.
Saved overrides are applied to product cards, product detail pages, URLs, image
alt text, and search metadata on the public storefront.

New Square products default to `NEEDS_PLACEMENT` or `NEEDS_REVIEW`. They do not publish automatically unless auto-publish is explicitly enabled later.

Placement rules are suggest-only by default. Admin approval is required before preview and publish.
