# Balloons

## Product model

Stocked balloon components should be Square item variations so inventory can be tracked. Non-stocked customization, such as a short message or presentation choice, can be modeled as Square modifiers.

## Guided flow

The first-milestone builder includes these section IDs:

- `balloons.landing-hero`
- `balloons.builder`
- `balloons.occasion-selector`
- `balloons.type-selector`
- `balloons.color-selector`
- `balloons.addons-selector`
- `balloons.fulfillment-selector`
- `balloons.time-slot-picker`

## Fulfillment

Balloons are pickup or local-delivery oriented. Most balloon products should not be warehouse-shippable unless explicitly modeled that way.

The storefront gate asks a local-delivery shopper only for a five-digit ZIP at
first. The server validates that ZIP against the OrderPRO eligibility boundary;
only an approved, unexpired response allows the shopper to continue to the
selected balloon collection. The full address, assigned store, fee, date, and
slot must be collected and revalidated later in checkout.

Development eligibility uses explicit mock ZIP fixtures. Production
local-delivery checkout remains fail-closed and cannot be released with an
environment flag alone. See [Phase 2 and CMS Handoff](phase-2-handoff.md).

## Capacity

Balloon work consumes capacity points. A simple mylar pickup can be 1 point, a latex bouquet can be 3 points, and a large arrangement can be 8 points.
