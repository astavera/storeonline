import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  BalloonDeliveryPostalEligibility,
  LocalDeliveryAddress,
  LocalDeliveryQuote,
  LocalDeliveryQuoteRequest,
  LocalDeliveryQuoteSuccess
} from "@/features/fulfillment/contracts/orderpro-local-delivery";
import {
  isWithinNewYorkDeliveryWindow
} from "@/features/fulfillment/utils/new-york-delivery-date";

export const localDeliveryQuoteRequestSchema = z.object({
  context: z.enum(["checkout", "balloon-order"]),
  address: z.object({
    line1: z.string().trim().min(5).max(160),
    line2: z.string().trim().max(80).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().length(2),
    postalCode: z.string().trim().regex(/^\d{5}$/),
    country: z.literal("US")
  }),
  requestedDate: z.string().date().refine((value) => isWithinNewYorkDeliveryWindow(value), {
    message: "Delivery dates must be between tomorrow and 90 days from today."
  })
});

export const balloonDeliveryPostalEligibilityRequestSchema = z.object({
  postalCode: z.string().trim().regex(/^\d{5}$/)
});

export type LocalDeliveryCheckoutSelectionInput = {
  quoteId: string;
  slotId: string;
  feeCents: number;
  requestedDate: string;
  address: LocalDeliveryAddress;
  locationId: string;
};

type DeliveryFixture = {
  line1: string;
  postalCode: string;
  selectedLocationId: string;
  selectedLocationName: string;
  assignmentRule: LocalDeliveryQuoteSuccess["assignmentRule"];
  walkingDistanceFeet: number;
  walkingDurationMinutes: number;
  feeCents: number;
  feeTierId: string;
};

const eligiblePostalCodes = new Set(["10021", "10028", "10065", "10075", "10128"]);
const zoneVersionId = "upper-east-side-walking-zones-v1-test";
const feePolicyVersionId = "walking-route-distance-v4-base-10-test";

const deliveryFixtures: DeliveryFixture[] = [
  {
    line1: "500 E 80th St",
    postalCode: "10075",
    selectedLocationId: "store-3rd-avenue",
    selectedLocationName: "3rd Avenue Store",
    assignmentRule: "NEAREST_WALKING_ROUTE",
    walkingDistanceFeet: 4_261,
    walkingDurationMinutes: 17,
    feeCents: 2_500,
    feeTierId: "whole-zone-25"
  },
  {
    line1: "599 E 85th St",
    postalCode: "10028",
    selectedLocationId: "store-86th-street",
    selectedLocationName: "86th Street Store",
    assignmentRule: "FIXED_POSTAL_ZONE",
    walkingDistanceFeet: 3_924,
    walkingDurationMinutes: 16,
    feeCents: 2_100,
    feeTierId: "extended-21"
  },
  {
    line1: "316 E 82nd St",
    postalCode: "10028",
    selectedLocationId: "store-86th-street",
    selectedLocationName: "86th Street Store",
    assignmentRule: "FIXED_POSTAL_ZONE",
    walkingDistanceFeet: 2_816,
    walkingDurationMinutes: 12,
    feeCents: 1_400,
    feeTierId: "extended-14"
  }
];

export function isOrderProDeliveryTestMode() {
  return process.env.NODE_ENV !== "production"
    || process.env.E2E_CATALOG_FIXTURE === "true"
    || process.env.ORDERPRO_DELIVERY_TEST_MODE === "true";
}

export async function quoteOrderProLocalDelivery(input: unknown): Promise<LocalDeliveryQuote> {
  const parsed = localDeliveryQuoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    return failure("INVALID_ADDRESS", "Enter a complete Manhattan delivery address and date.");
  }

  if (!isOrderProDeliveryTestMode()) {
    return failure(
      process.env.ORDERPRO_API_URL ? "ORDERPRO_UNAVAILABLE" : "ORDERPRO_NOT_CONFIGURED",
      "Local delivery quoting is temporarily unavailable. Please choose pickup or contact the store."
    );
  }

  return quoteMockLocalDelivery(parsed.data);
}

export async function checkOrderProBalloonPostalEligibility(input: unknown): Promise<BalloonDeliveryPostalEligibility> {
  const parsed = balloonDeliveryPostalEligibilityRequestSchema.safeParse(input);
  if (!parsed.success) {
    return postalEligibilityFailure("INVALID_POSTAL_CODE", "Enter a valid 5-digit ZIP code.");
  }

  if (!isOrderProDeliveryTestMode()) {
    return postalEligibilityFailure(
      process.env.ORDERPRO_API_URL ? "ORDERPRO_UNAVAILABLE" : "ORDERPRO_NOT_CONFIGURED",
      "Local delivery approval is temporarily unavailable. Please choose pickup or contact the store.",
      "ORDERPRO"
    );
  }

  return checkMockBalloonPostalEligibility(parsed.data.postalCode);
}

export function checkMockBalloonPostalEligibility(postalCode: string): BalloonDeliveryPostalEligibility {
  const normalizedPostalCode = postalCode.trim();
  if (!eligiblePostalCodes.has(normalizedPostalCode)) {
    return postalEligibilityFailure(
      "OUTSIDE_DELIVERY_AREA",
      "OrderPro does not currently approve local balloon delivery for this ZIP code."
    );
  }

  return {
    eligible: true,
    source: "MOCK",
    postalCode: normalizedPostalCode,
    approvalId: `balloon-delivery-test-${createHash("sha256").update(normalizedPostalCode).digest("hex").slice(0, 16)}`,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
  };
}

export async function validateOrderProLocalDeliverySelection(input: LocalDeliveryCheckoutSelectionInput) {
  const quote = await quoteOrderProLocalDelivery({
    context: "checkout",
    address: input.address,
    requestedDate: input.requestedDate
  });

  if (!quote.eligible) {
    return { valid: false as const, message: quote.message };
  }

  const slotIsAvailable = quote.availableSlots.some((slot) => slot.id === input.slotId);
  const valid = quote.quoteId === input.quoteId
    && quote.selectedLocationId === input.locationId
    && quote.feeCents === input.feeCents
    && slotIsAvailable
    && Date.parse(quote.expiresAt) > Date.now();

  return valid
    ? { valid: true as const, quote }
    : {
        valid: false as const,
        message: "The local delivery quote or time slot is no longer valid. Check the address again."
      };
}

export function quoteMockLocalDelivery(input: LocalDeliveryQuoteRequest): LocalDeliveryQuote {
  const normalizedAddress = normalizeAddress(input.address);
  if (!eligiblePostalCodes.has(normalizedAddress.postalCode)) {
    return failure("OUTSIDE_WALKING_AREA", "This address is outside the current walking delivery area.");
  }

  const normalizedLine1 = normalizeLine1(normalizedAddress.line1);
  const fixture = deliveryFixtures.find((candidate) =>
    normalizeLine1(candidate.line1) === normalizedLine1
    && candidate.postalCode === normalizedAddress.postalCode);

  if (!fixture) {
    return failure(
      "TEST_ADDRESS_UNAVAILABLE",
      "OrderPro is not connected yet. Use one of the test addresses shown below to preview this flow."
    );
  }

  const quoteSeed = `${input.context}|${JSON.stringify(normalizedAddress)}|${input.requestedDate}`;

  return {
    eligible: true,
    source: "MOCK",
    quoteId: `delivery-test-${createHash("sha256").update(quoteSeed).digest("hex").slice(0, 16)}`,
    requestedDate: input.requestedDate,
    normalizedAddress,
    selectedLocationId: fixture.selectedLocationId,
    selectedLocationName: fixture.selectedLocationName,
    assignmentRule: fixture.assignmentRule,
    walkingDistanceFeet: fixture.walkingDistanceFeet,
    walkingDurationMinutes: fixture.walkingDurationMinutes,
    estimatedRoundTripMinutes: fixture.walkingDurationMinutes * 2 + 8,
    feeCents: fixture.feeCents,
    currency: "USD",
    feeTierId: fixture.feeTierId,
    availableSlots: [],
    zoneVersionId,
    feePolicyVersionId,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
  };
}

function normalizeAddress(address: LocalDeliveryAddress): LocalDeliveryAddress {
  return {
    line1: address.line1.trim().replace(/\s+/g, " "),
    ...(address.line2?.trim() ? { line2: address.line2.trim().replace(/\s+/g, " ") } : {}),
    city: "New York",
    state: "NY",
    postalCode: address.postalCode.trim(),
    country: "US"
  };
}

function normalizeLine1(value: string) {
  return value.toLowerCase().replace(/\bstreet\b/g, "st").replace(/[.,#-]/g, " ").replace(/\s+/g, " ").trim();
}

function failure(
  reasonCode: Extract<LocalDeliveryQuote, { eligible: false }>["reasonCode"],
  message: string
): LocalDeliveryQuote {
  return { eligible: false, source: "MOCK", reasonCode, message };
}

function postalEligibilityFailure(
  reasonCode: Extract<BalloonDeliveryPostalEligibility, { eligible: false }>["reasonCode"],
  message: string,
  source: BalloonDeliveryPostalEligibility["source"] = "MOCK"
): BalloonDeliveryPostalEligibility {
  return { eligible: false, source, reasonCode, message };
}
