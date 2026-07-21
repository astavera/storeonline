export type OrderProPickupSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string;
};

export type OrderProPickupAvailabilitySuccess = {
  available: true;
  source: "ORDERPRO" | "MOCK";
  locationId: string;
  requestedDate: string;
  availableSlots: OrderProPickupSlot[];
  expiresAt: string;
};

export type OrderProPickupAvailabilityFailure = {
  available: false;
  source: "ORDERPRO" | "MOCK";
  reasonCode: "INVALID_REQUEST" | "LOCATION_UNAVAILABLE" | "NO_AVAILABLE_SLOTS" | "ORDERPRO_NOT_CONFIGURED" | "ORDERPRO_UNAVAILABLE";
  message: string;
};

export type OrderProPickupAvailability = OrderProPickupAvailabilitySuccess | OrderProPickupAvailabilityFailure;
