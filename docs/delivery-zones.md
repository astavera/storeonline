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
