/**
 * Verifies that pickup inventory appears only on product detail content with real location counts.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PickupLocationInventory } from "@/components/commerce/pickup-location-inventory";

afterEach(cleanup);

describe("pickup location inventory", () => {
  const pickupInventory = [
    { locationId: "third-avenue", locationName: "3rd Avenue Store", quantity: 0 },
    { locationId: "east-86th", locationName: "86th Street Store", quantity: 1 }
  ];

  it("shows the real quantity for each pickup store", () => {
    render(<PickupLocationInventory product={{ fulfillmentModes: ["pickup", "shipping"], pickupInventory }} />);

    expect(screen.getByRole("region", { name: "Pickup availability by location" })).not.toBeNull();
    expect(screen.getByText("3rd Avenue Store")).not.toBeNull();
    expect(screen.getByText("Sold out")).not.toBeNull();
    expect(screen.getByText("86th Street Store")).not.toBeNull();
    expect(screen.getByText("1 left")).not.toBeNull();
  });

  it("stays hidden when pickup is unavailable or no real location counts exist", () => {
    const { rerender } = render(<PickupLocationInventory product={{ fulfillmentModes: ["shipping"], pickupInventory }} />);
    expect(screen.queryByRole("region")).toBeNull();

    rerender(<PickupLocationInventory product={{ fulfillmentModes: ["pickup"] }} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
