/** Verifies balloon pickup and local-delivery selection without shipping. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BalloonCatalogGate } from "@/components/balloons/balloon-catalog-gate";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

describe("BalloonCatalogGate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ eligibility: approvedEligibility("10075") })
    } as Response));
  });

  afterEach(() => {
    cleanup();
    pushMock.mockClear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("opens a four-step ordering guide on entry", () => {
    render(<BalloonCatalogGate />);

    expect(screen.getByRole("dialog", { name: "Ordering balloons is easy" })).toBeTruthy();
    expect(screen.getByText("Pick your balloons")).toBeTruthy();
    expect(screen.getByText("Delivery or pickup")).toBeTruthy();
    expect(screen.getByText("Add to your cart")).toBeTruthy();
    expect(screen.getByText("Checkout")).toBeTruthy();
    expect(screen.queryByText("Local delivery")).toBeNull();
    expect(screen.queryByText("Store pickup")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start shopping" }));
    expect(screen.queryByRole("dialog", { name: "Ordering balloons is easy" })).toBeNull();
    expect(screen.getByRole("button", { name: "How balloon ordering works" })).toBeTruthy();
  });

  it("offers store pickup and local delivery without shipping", () => {
    render(<BalloonCatalogGate />);
    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));

    expect(screen.getByRole("dialog", { name: "Choose fulfillment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Store pickup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Local delivery" })).toBeTruthy();
    expect(screen.queryByText(/shipping/i)).toBeNull();
  });

  it("continues after OrderPro approves local delivery", async () => {
    render(<BalloonCatalogGate />);
    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: "Local delivery" }));
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "10075" } });
    fireEvent.click(screen.getByRole("button", { name: "Check delivery" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/shop?collection=latex&fulfillment=delivery&postalCode=10075"));
    expect(JSON.parse(window.sessionStorage.getItem("modern-state-balloon-fulfillment") ?? "null")).toMatchObject({ mode: "delivery", postalCode: "10075" });
  });

  it("keeps store and date before choosing a real pickup slot at checkout", async () => {
    render(<BalloonCatalogGate />);
    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: "Store pickup" }));
    expect(screen.getByText("Choose an available pickup time at checkout after adding balloons to your cart.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Shop Latex balloons" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const destination = String(pushMock.mock.calls[0][0]);
    expect(destination).toContain("collection=latex");
    expect(destination).toContain("fulfillment=pickup");
    expect(destination).toContain("location=3rd-avenue");
    expect(destination).toContain(`pickupDate=${earliestNewYorkDeliveryDate()}`);
    expect(JSON.parse(window.sessionStorage.getItem("modern-state-balloon-fulfillment") ?? "null")).toMatchObject({
      mode: "pickup",
      requestedDate: earliestNewYorkDeliveryDate()
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays interactive-free inside the CMS preview", () => {
    render(<BalloonCatalogGate previewMode />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the pickup calendar and selects a day without the native mobile date picker", () => {
    render(<BalloonCatalogGate />);
    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: "Store pickup" }));
    fireEvent.click(screen.getByRole("button", { name: /Choose pickup date/ }));

    expect(screen.getByRole("dialog", { name: "Choose pickup date" })).toBeTruthy();

    const nextDate = dateAfter(earliestNewYorkDeliveryDate(), 1);
    fireEvent.click(screen.getByRole("button", { name: calendarDateLabel(nextDate) }));

    expect(screen.queryByRole("dialog", { name: "Choose pickup date" })).toBeNull();
    expect(screen.getByRole("button", { name: `Choose pickup date, currently ${shortDateLabel(nextDate)}` })).toBeTruthy();
  });

  it("offers store contact when local delivery is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ eligibility: { eligible: false, source: "ORDERPRO", reasonCode: "OUTSIDE_DELIVERY_AREA", message: "Outside delivery area." } })
    } as Response);
    render(<BalloonCatalogGate />);
    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: "Local delivery" }));
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "99999" } });
    fireEvent.click(screen.getByRole("button", { name: "Check delivery" }));

    expect(await screen.findByText("Sorry, we don\'t currently deliver to this area.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "212-831-8010" }).getAttribute("href")).toBe("tel:2128318010");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("opens fulfillment choices from a linked collection", () => {
    render(<BalloonCatalogGate initialCollection="mylar" />);
    expect(screen.getByRole("dialog", { name: "Choose fulfillment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Store pickup" })).toBeTruthy();
    expect(screen.queryByText(/shipping/i)).toBeNull();
  });
});

function approvedEligibility(postalCode: string) {
  return { eligible: true as const, source: "MOCK" as const, postalCode, approvalId: "approved", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
}

function dateAfter(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function calendarDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", weekday: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function shortDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
