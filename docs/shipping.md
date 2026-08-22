# Shipping

Shipping outside local delivery zones routes through warehouse fulfillment.

## First abstraction

Shippo is the first carrier abstraction. FedEx and UPS direct integrations can be added later behind the same server-side shipping service contract.

## Flow

1. Customer enters a shipping address.
2. Backend validates the address.
3. Backend confirms all products are shippable.
4. Backend assigns the order to Warehouse.
5. Backend checks Square warehouse inventory.
6. Backend retrieves rates from Shippo.
7. Customer selects a shipping method.
8. Backend creates a Square order with shipment fulfillment when appropriate.
9. Backend processes payment.
10. Warehouse task is created.
11. Label is printed.
12. Tracking is saved and sent to the customer.

Frontend shipping rates are never trusted.

For checkout rating, multiple physical units are consolidated into one conservative parcel: weights and heights are added, while the greatest length and width are retained. The signed quote binds both the cart quantities and the authoritative per-product package metadata, so any change requires a fresh rate.
