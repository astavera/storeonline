/**
 * Defines the OrderPro local delivery contracts used by the fulfillment feature.
 */

export type LocalDeliveryQuoteContext = "checkout" | "balloon-order";

export type LocalDeliveryAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
};

export type LocalDeliveryQuoteRequest = {
  context: LocalDeliveryQuoteContext;
  address: LocalDeliveryAddress;
  requestedDate: string;
};

export type LocalDeliverySlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string;
};

export type LocalDeliveryQuoteSuccess = {
  eligible: true;
  source: "ORDERPRO" | "MOCK";
  quoteId: string;
  requestedDate: string;
  normalizedAddress: LocalDeliveryAddress;
  selectedLocationId: string;
  selectedLocationName: string;
  assignmentRule: "FIXED_POSTAL_ZONE" | "NEAREST_WALKING_ROUTE";
  walkingDistanceFeet: number;
  walkingDurationMinutes: number;
  estimatedRoundTripMinutes: number;
  feeCents: number;
  currency: "USD";
  feeTierId: string;
  availableSlots: LocalDeliverySlot[];
  zoneVersionId: string;
  feePolicyVersionId: string;
  expiresAt: string;
};

export type LocalDeliveryQuoteFailure = {
  eligible: false;
  source: "ORDERPRO" | "MOCK";
  reasonCode:
    | "INVALID_ADDRESS"
    | "OUTSIDE_WALKING_AREA"
    | "TEST_ADDRESS_UNAVAILABLE"
    | "ORDERPRO_NOT_CONFIGURED"
    | "ORDERPRO_UNAVAILABLE";
  message: string;
};

export type LocalDeliveryQuote = LocalDeliveryQuoteSuccess | LocalDeliveryQuoteFailure;

export type BalloonDeliveryPostalEligibilitySuccess = {
  eligible: true;
  source: "ORDERPRO" | "MOCK";
  postalCode: string;
  approvalId: string;
  expiresAt: string;
};

export type BalloonDeliveryPostalEligibilityFailure = {
  eligible: false;
  source: "ORDERPRO" | "MOCK";
  reasonCode:
    | "INVALID_POSTAL_CODE"
    | "OUTSIDE_DELIVERY_AREA"
    | "ORDERPRO_NOT_CONFIGURED"
    | "ORDERPRO_UNAVAILABLE";
  message: string;
};

export type BalloonDeliveryPostalEligibility =
  | BalloonDeliveryPostalEligibilitySuccess
  | BalloonDeliveryPostalEligibilityFailure;

export type LocalDeliverySelection = {
  quote: LocalDeliveryQuoteSuccess;
  slotId: string;
};
