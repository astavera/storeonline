# Delivery Zones

Delivery zones are admin-managed polygons assigned to store locations.

Required fields:

- location ID
- name
- polygon GeoJSON
- active state
- service mode: walking, local courier, or vehicle
- base fee
- minimum order amount
- max distance
- max route minutes
- priority
- active days
- cutoff minutes
- lead time minutes

The frontend may draw or preview zones, but the backend must geocode addresses, verify polygon membership, calculate fees, and validate route constraints. The first deterministic point-in-polygon helper lives in `src/features/fulfillment/services/delivery-zone-service.ts`.

## Commercial balloon-delivery policy

The owner-provided Third Avenue price list and the known 86th Street boundary are
audited in `docs/balloon-delivery-pricing-policy.md`. Nine longitudinal samples
support a draft route-distance table of 0–1,200 ft free, more than 1,200–2,300
ft at $10, more than 2,300–3,250 ft at $15, and more than 3,250 ft at $25 while
the address remains inside an eligible ZIP/polygon. The avenue surcharges do not
fit a single distance function and would have to be retired for this
standardization. The draft must
not be applied to shared environments until its owner-review items are resolved.

## Walking address routing contract

The orange walking area is represented by versioned GeoJSON polygons, never by
pixel-color inspection at request time. The backend evaluates the geocoded point
against every enabled location, compares server-derived walking route metrics,
and selects the nearest eligible store. It then returns that store's calculated
fee and available slots only.

The pure routing contract lives in
`src/features/fulfillment/services/local-delivery-routing-service.ts`. It does
not fall back to a farther store when the nearest store has no slots; a future UI
may offer that choice explicitly. The map screenshot is reference material, not
an activation-ready polygon.

The pure, versioned feet-tier evaluator lives in
`src/features/fulfillment/services/walking-route-distance-fee-service.ts`. It is
not wired to checkout and contains no hardcoded commercial tiers. The calibrated
values currently exist only as deterministic test fixtures pending publication
by OrderPro. A final open-ended tier is supported so distance alone never rejects
an address that belongs to a published delivery zone.
