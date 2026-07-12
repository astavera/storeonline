# Slot Capacity

Pickup and delivery slots use capacity points instead of simple order counts.

Examples:

- Simple mylar pickup: 1 point.
- Latex bouquet pickup: 3 points.
- Large arrangement: 8 points.
- Local delivery stop: 2 points.
- Same-day rush: additional points.

Reservation flow:

1. Customer selects a time window.
2. Backend creates a temporary hold.
3. Hold expires if payment is not completed.
4. Checkout revalidates slot capacity.
5. Backend locks capacity in a database transaction.
6. Square payment succeeds.
7. Slot reservation becomes confirmed.
8. Payment failure releases the hold.

The first helper lives in `src/features/fulfillment/services/slot-capacity-service.ts`.
