/**
 * Implements server-side OrderPro local delivery service behavior and persistence boundaries.
 */

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
import { getOrderProPrivatePreviewClient } from "@/server/orderpro/private-preview-client";

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
  return process.env.NODE_ENV !== "production";
}

export async function quoteOrderProLocalDelivery(input: unknown): Promise<LocalDeliveryQuote> {
  const parsed = localDeliveryQuoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    return failure("INVALID_ADDRESS", "Enter a complete Manhattan delivery address and date.");
  }

  if (!isOrderProDeliveryTestMode()) {
    const client = getOrderProPrivatePreviewClient();
    if (!client) {
      return failure(
        "ORDERPRO_NOT_CONFIGURED",
        "Local delivery quoting is temporarily unavailable. Please choose pickup or contact the store."
      );
    }

    try {
      const quote = await client.quoteLocalDelivery({
        line1: parsed.data.address.line1,
        line2: parsed.data.address.line2 ?? null,
        postalCode: parsed.data.address.postalCode,
        quantity: 1,
        requestedDate: parsed.data.requestedDate
      });
      if (!quote.eligible) {
        return failure(
          quote.reasonCode === "OUTSIDE_WALKING_AREA" ? "OUTSIDE_WALKING_AREA" : "ORDERPRO_UNAVAILABLE",
          quote.storefrontMessage
        );
      }

      const walkingDurationMinutes = Math.max(1, Math.ceil(quote.walkingDurationSeconds / 60));
      const quoteSeed = [
        parsed.data.requestedDate,
        quote.normalizedAddress.line1,
        quote.normalizedAddress.postalCode,
        quote.selectedLocationId,
        quote.feeCents
      ].join("|");

      return {
        eligible: true,
        source: "ORDERPRO",
        quoteId: `orderpro-preview-${createHash("sha256").update(quoteSeed).digest("hex").slice(0, 20)}`,
        requestedDate: parsed.data.requestedDate,
        normalizedAddress: {
          line1: quote.normalizedAddress.line1,
          ...(quote.normalizedAddress.line2 ? { line2: quote.normalizedAddress.line2 } : {}),
          city: quote.normalizedAddress.city,
          state: quote.normalizedAddress.state,
          postalCode: quote.normalizedAddress.postalCode.slice(0, 5),
          country: "US"
        },
        selectedLocationId: storefrontLocationId(quote.selectedLocationId),
        selectedLocationName: quote.selectedLocationName,
        assignmentRule: quote.candidateRoutes.length > 1 ? "NEAREST_WALKING_ROUTE" : "FIXED_POSTAL_ZONE",
        walkingDistanceFeet: Math.round(quote.walkingDistanceFeet),
        walkingDurationMinutes,
        estimatedRoundTripMinutes: walkingDurationMinutes * 2 + 8,
        feeCents: quote.feeCents,
        currency: "USD",
        feeTierId: "orderpro-published-preview",
        availableSlots: quote.availableSlots.map((slot) => ({
          id: slot.slotId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          label: slotLabel(slot.startsAt, slot.endsAt)
        })),
        zoneVersionId: "orderpro-published-zone-set",
        feePolicyVersionId: "orderpro-published-fee-policy",
        expiresAt: quote.expiresAt
      };
    } catch {
      return failure(
        "ORDERPRO_UNAVAILABLE",
        "Local delivery quoting is temporarily unavailable. Please choose pickup or contact the store."
      );
    }
  }

  return quoteMockLocalDelivery(parsed.data);
}

export async function checkOrderProBalloonPostalEligibility(input: unknown): Promise<BalloonDeliveryPostalEligibility> {
  const parsed = balloonDeliveryPostalEligibilityRequestSchema.safeParse(input);
  if (!parsed.success) {
    return postalEligibilityFailure("INVALID_POSTAL_CODE", "Enter a valid 5-digit ZIP code.");
  }

  if (!isOrderProDeliveryTestMode()) {
    const client = getOrderProPrivatePreviewClient();
    if (!client) {
      return postalEligibilityFailure(
        "ORDERPRO_NOT_CONFIGURED",
        "Local delivery approval is temporarily unavailable. Please choose pickup or contact the store.",
        "ORDERPRO"
      );
    }

    try {
      const eligibility = await client.checkPostalEligibility(parsed.data.postalCode);
      return eligibility.eligible ? {
        eligible: true,
        source: "ORDERPRO",
        postalCode: eligibility.postalCode,
        approvalId: eligibility.approvalId,
        expiresAt: eligibility.expiresAt
      } : postalEligibilityFailure(
        "OUTSIDE_DELIVERY_AREA",
        eligibility.message,
        "ORDERPRO"
      );
    } catch {
      return postalEligibilityFailure(
        "ORDERPRO_UNAVAILABLE",
        "Local delivery approval is temporarily unavailable. Please choose pickup or contact the store.",
        "ORDERPRO"
      );
    }
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

function storefrontLocationId(locationId: "third_avenue" | "east_86th_street") {
  return locationId === "third_avenue" ? "store-3rd-avenue" : "store-86th-street";
}

function slotLabel(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
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
