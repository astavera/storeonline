/**
 * Verifies balloon pickup and local-delivery order experiences.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BalloonOrderExperience, LatexOrderExperience } from "@/components/balloons/latex-order-experience";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

const baseProduct = product({
  squareVariationId: "latex-blue",
  name: `11" Fashion Blue Latex Balloon`,
  priceCents: 300
});
const hiFloat = product({ squareVariationId: "hi-float", name: "Hi-Float", priceCents: 50 });
const weight = product({ squareVariationId: "weight-gold", name: "Balloon Weights Gold", priceCents: 225 });

describe("LatexOrderExperience", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows local delivery status and builds a draft balloon order", () => {
    render(<LatexOrderExperience addOns={{ hiFloat, weights: [weight] }} postalCode="10075" products={[baseProduct]} />);

    expect(screen.getByLabelText("Delivering to: 10075")).toBeTruthy();
    expect(screen.getByText(/Local delivery/)).toBeTruthy();
    expect(screen.queryByText(/Pickup/)).toBeNull();
    expect(screen.queryByText(/Shipping/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Fashion Blue/ }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Hi-Float treatment/ }));
    fireEvent.click(screen.getByRole("button", { name: /Gold/ }));
    expect(screen.getByRole("button", { name: /Add to order.*\$9\.25/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add to order/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByText("Fashion Blue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hi-Float treatment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gold weight").length).toBeGreaterThan(0);
  });

  it("shows the saved store and time for pickup orders", () => {
    render(
      <LatexOrderExperience
        addOns={{ weights: [] }}
        fulfillment="pickup"
        location="3rd-avenue"
        products={[baseProduct]}
        requestedDate="2026-08-08"
        slotLabel="10:00 AM–12:00 PM"
      />
    );

    expect(screen.getByLabelText("Current fulfillment")).toBeTruthy();
    expect(screen.getByText("Store pickup")).toBeTruthy();
    expect(screen.getByText("3rd Avenue Store")).toBeTruthy();
    expect(screen.getByText(/10:00 AM–12:00 PM/)).toBeTruthy();
    expect(screen.queryByText(/Shipping/)).toBeNull();
  });

  it("uses the same guided order layout for a non-Latex balloon collection", () => {
    const mylar = product({
      squareVariationId: "mylar-birthday",
      name: "Happy Birthday Mylar Balloon",
      department: "Mylar Balloons",
      shortDescription: "Inflated birthday balloon",
      priceCents: 799
    });

    render(
      <BalloonOrderExperience
        collection={{ slug: "mylar", title: "Mylar Balloons", description: "Choose a design and quantity." }}
        postalCode="10028"
        products={[mylar]}
      />
    );

    expect(screen.getByLabelText("Delivering to: 10028")).toBeTruthy();
    expect(screen.queryByLabelText("Current fulfillment")).toBeNull();
    expect(screen.queryByLabelText("Filter Latex balloons by finish")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Happy Birthday Mylar Balloon/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: /Add to order.*\$15\.98/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add to order/ }));

    expect(screen.getAllByText("Happy Birthday Mylar Balloon").length).toBeGreaterThan(0);
  });
});

function product(overrides: Partial<StorefrontProduct>): StorefrontProduct {
  const squareVariationId = overrides.squareVariationId ?? "variation";
  return {
    id: squareVariationId,
    squareVariationId,
    slug: squareVariationId,
    name: "Balloon product",
    department: "Latex Balloons",
    shortDescription: "Balloon product",
    description: "Balloon product",
    imageUrl: "/images/balloons/latex-bouquet-v1.png",
    priceCents: 300,
    fulfillmentModes: ["pickup", "local-delivery"],
    inventoryStatus: "in-stock",
    ...overrides
  };
}
