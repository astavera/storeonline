/**
 * Classifies the one OrderPRO release error that proves the reservation is
 * already terminal and its inventory is no longer held.
 */
export function isShippingOrderAlreadyReleased(error: unknown) {
  return error instanceof Error && error.message === "SHIPPING_ORDER_RELEASE_CONFLICT";
}
