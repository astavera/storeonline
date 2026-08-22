/** Verifies that the browser sends only the strict pickup quote contract. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PickupSchedulePanel } from "@/components/fulfillment/pickup-schedule-panel";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("PickupSchedulePanel", () => {
  it("confirms that ASAP is selected and does not require a time slot", async () => {
    const onSelectionChange = vi.fn();

    render(
      <PickupSchedulePanel
        context="regular"
        items={[{ squareVariationId: "variation-a", quantity: 1 }]}
        locationId="store-3rd-avenue"
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByRole("status").textContent).toContain("ASAP pickup selected.");
    expect(screen.getByRole("status").textContent).toContain("No time slot is required.");
    await waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith({ timing: "ASAP" }));
  });

  it("omits the cart-only source field from pickup quote lines", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        availability: {
          available: false,
          source: "ORDERPRO",
          reasonCode: "NO_AVAILABLE_SLOTS",
          message: "No pickup times are available."
        }
      })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const storedCartItems = [{
      squareVariationId: "variation-a",
      quantity: 2,
      source: "storefront" as const
    }];

    render(
      <PickupSchedulePanel
        context="regular"
        items={storedCartItems}
        locationId="store-86th-street"
        onSelectionChange={() => undefined}
      />
    );
    fireEvent.click(screen.getByText("Schedule (2+ hours)"));
    fireEvent.click(screen.getByRole("button", { name: "Show pickup times" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("/api/fulfillment/pickup-slots");
    expect(payload).toMatchObject({
      context: "regular",
      locationId: "store-86th-street",
      cartLines: [{ squareVariationId: "variation-a", quantity: 2 }]
    });
  });
});
