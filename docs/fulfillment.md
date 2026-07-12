# Fulfillment

## Modes

- Pickup: store pickup at 3rd Avenue or 86th Street.
- Local delivery: address must be geocoded and verified inside an active delivery zone.
- Shipping: eligible products route through warehouse fulfillment.

## Mixed carts

The checkout cannot silently mix invalid fulfillment types. If a cart contains local-delivery-only balloons and warehouse-shippable items, it must either split into clear fulfillment groups or block checkout until the customer chooses a valid group.

## Statuses

Fulfillment statuses are represented in the Prisma schema and include `NEW`, `PAID`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `PICKED_UP`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `WAREHOUSE_PICKING`, `PACKED`, `LABEL_CREATED`, `SHIPPED`, `CANCELLED`, and `FAILED`.

## Staff app

The internal app will support location dashboards, pickup queue, balloon prep queue, local delivery queue, route view, warehouse queue, pick/pack, label printing, order details, customer contact, capacity calendar, delivery zone editor, and audit log.
