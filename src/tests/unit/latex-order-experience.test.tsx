import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BalloonOrderExperience, LatexOrderExperience } from "@/components/balloons/latex-order-experience";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

const baseProduct = product({
  squareVariationId: "latex-blue",
  name: '11" Fashion Blue Latex Balloon',
  priceCents: 300
});
const hiFloat = product({ squareVariationId: "hi-float", name: "Hi-Float", priceCents: 50 });
const weight = product({ squareVariationId: "weight-gold", name: "Balloon Weights Gold", priceCents: 225 });

describe("LatexOrderExperience", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows the focused Latex header and builds a draft balloon order", () => {
    render(<LatexOrderExperience addOns={{ hiFloat, weights: [weight] }} fulfillment="pickup" location="3rd-avenue" products={[baseProduct]} requestedDate="2026-07-21" slotLabel="12:00–3:00 PM" />);

    expect(screen.getByRole("heading", { level: 1, name: "Latex Balloons" })).toBeTruthy();
    expect(screen.queryByText("Balloon collection")).toBeNull();
    expect(screen.queryByText("Shop latex balloons for bouquets, parties, and colorful everyday celebrations.")).toBeNull();
    expect(screen.getByText("3rd Avenue Store")).toBeTruthy();
    expect(screen.getByText("Tue, Jul 21 · 12:00–3:00 PM")).toBeTruthy();

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
        fulfillment="local-delivery"
        location="86th-street"
        postalCode="10028"
        products={[mylar]}
      />
    );

    expect(screen.queryByRole("heading", { level: 1, name: "Mylar Balloons" })).toBeNull();
    expect(screen.queryByText("86th Street Store")).toBeNull();
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
