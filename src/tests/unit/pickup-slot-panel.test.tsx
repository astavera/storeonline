/** Verifies the authoritative Pickup selector used by normal product checkout. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PickupSlotPanel } from "@/components/fulfillment/pickup-slot-panel";

vi.mock("@/features/fulfillment/utils/new-york-delivery-date", () => ({
  earliestNewYorkDeliveryDate: () => "2026-08-19",
  latestNewYorkDeliveryDate: () => "2026-09-18"
}));

const availability = {
  available: true,
  source: "ORDERPRO" as const,
  quoteId: "00000000-0000-4000-8000-000000000602",
  requestedDate: "2026-08-19",
  locationId: "store-86th-street",
  locationName: "86th Street Store",
  expiresAt: "2099-08-19T14:55:00.000Z",
  availableSlots: [{
    id: "pickup-slot-1",
    startsAt: "2026-08-19T15:00:00.000Z",
    endsAt: "2026-08-19T16:00:00.000Z",
    label: "11:00 AM-12:00 PM"
  }]
};

describe("general checkout Pickup selector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads OrderPRO slots for a normal cart and returns the signed quote identity", async () => {
    const onSelectionChange = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({ availability })
    } as Response);

    render(
      <PickupSlotPanel
        items={[{ squareVariationId: "normal-product-variation", quantity: 2 }]}
        locationId="store-86th-street"
        onSelectionChange={onSelectionChange}
      />
    );

    expect(await screen.findByText("11:00 AM-12:00 PM")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fulfillment/pickup-slots",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          locationId: "store-86th-street",
          requestedDate: "2026-08-19",
          items: [{ squareVariationId: "normal-product-variation", quantity: 2 }]
        })
      })
    );

    fireEvent.click(screen.getByRole("radio", { name: "11:00 AM-12:00 PM" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      quoteId: availability.quoteId,
      requestedDate: "2026-08-19",
      slotId: "pickup-slot-1",
      slotLabel: "11:00 AM-12:00 PM",
      startsAt: "2026-08-19T15:00:00.000Z",
      endsAt: "2026-08-19T16:00:00.000Z"
    });
  });

  it("invalidates the old slot immediately when the requested date changes", async () => {
    const onSelectionChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({ availability })
    } as Response);
    render(
      <PickupSlotPanel
        items={[{ squareVariationId: "normal-product-variation", quantity: 1 }]}
        locationId="store-86th-street"
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.click(await screen.findByRole("radio", { name: "11:00 AM-12:00 PM" }));
    onSelectionChange.mockClear();

    fireEvent.change(screen.getByLabelText("Pickup date"), {
      target: { value: "2026-08-20" }
    });

    await waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith(null));
  });
});
