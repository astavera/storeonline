import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BalloonCatalogGate } from "@/components/balloons/balloon-catalog-gate";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

describe("BalloonCatalogGate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ availability: pickupAvailability() })
    }));
  });

  afterEach(() => {
    cleanup();
    pushMock.mockClear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("opens the fulfillment gate for a collection and offers both pickup stores", async () => {
    render(<BalloonCatalogGate />);

    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));

    expect(screen.getByRole("dialog", { name: "Choose fulfillment" })).toBeTruthy();
    expect(screen.queryByText("Shopping Latex")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pickup or delivery?" })).toBeNull();
    expect(screen.queryByLabelText("Balloon order progress")).toBeNull();
    expect(screen.queryByText(/We’ll use this choice/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Store pickup/ }));

    expect(screen.getByText("Shopping Latex")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose your pickup store" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /3rd Avenue Store/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /86th Street Store/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pickup date/ })).toBeTruthy();
    const shopButton = screen.getByRole("button", { name: "Shop Latex balloons" }) as HTMLButtonElement;
    expect(shopButton.disabled).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: /^10:00 AM/ }));
    expect(shopButton.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Change to local delivery" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Change to local delivery" }));

    expect(screen.getByText(/OrderPro will confirm whether you can continue/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change to pickup" })).toBeTruthy();
    expect(screen.getByLabelText("ZIP code")).toBeTruthy();
    expect(screen.queryByLabelText("Street address")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delivery date/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Check ZIP code" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("continues to the balloon order only after OrderPro approves the ZIP code", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("local-delivery-postal-eligibility")) {
        return {
          json: async () => ({
            eligibility: {
              eligible: true,
              source: "MOCK",
              postalCode: "10075",
              approvalId: "balloon-delivery-test-approved",
              expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
            }
          })
        } as Response;
      }

      return { json: async () => ({ availability: pickupAvailability() }) } as Response;
    });
    render(<BalloonCatalogGate />);

    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: /Local delivery/ }));
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "10075" } });
    fireEvent.click(screen.getByRole("button", { name: "Check ZIP code" }));

    expect(await screen.findByText("Approved by OrderPro")).toBeTruthy();
    expect(screen.getByText("Local delivery is available for ZIP 10075.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Latex order" }));

    expect(pushMock).toHaveBeenCalledWith("/shop?collection=latex&fulfillment=delivery");
    const preference = JSON.parse(window.sessionStorage.getItem("modern-state-balloon-fulfillment") ?? "null") as { mode: string; postalCode: string; approvalId: string };
    expect(preference).toMatchObject({
      mode: "delivery",
      postalCode: "10075",
      approvalId: "balloon-delivery-test-approved"
    });
  });

  it("opens the same fulfillment flow from a linked balloon collection", () => {
    render(<BalloonCatalogGate initialCollection="mylar" />);

    expect(screen.getByRole("dialog", { name: "Choose fulfillment" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Store pickup/ }));
    expect(screen.getByText("Shopping Mylar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shop Mylar balloons" })).toBeTruthy();
  });

  it("shows the slot UI without inventing pickup times when OrderPro returns none", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({ availability: { ...pickupAvailability(), availableSlots: [] } })
    } as Response);
    render(<BalloonCatalogGate />);

    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: /Store pickup/ }));

    expect(await screen.findByText(/Available times from OrderPro will appear here/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^10:00 AM/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Shop Latex balloons" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires and saves an OrderPro pickup date and time slot before shopping", async () => {
    render(<BalloonCatalogGate />);

    fireEvent.click(screen.getByRole("button", { name: "Shop latex balloons" }));
    fireEvent.click(screen.getByRole("button", { name: /Store pickup/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^12:00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Shop Latex balloons" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const destination = String(pushMock.mock.calls[0][0]);
    expect(destination).toContain("collection=latex");
    expect(destination).toContain(`pickupDate=${earliestNewYorkDeliveryDate()}`);
    expect(destination).toContain(`pickupSlot=pickup-test-store-3rd-avenue-${earliestNewYorkDeliveryDate()}-1200`);
    expect(destination).toContain("pickupSlotLabel=");

    const preference = JSON.parse(window.sessionStorage.getItem("modern-state-balloon-fulfillment") ?? "null") as { requestedDate: string; slotId: string; slotLabel: string };
    expect(preference.requestedDate).toBe(earliestNewYorkDeliveryDate());
    expect(preference.slotId).toBe(`pickup-test-store-3rd-avenue-${earliestNewYorkDeliveryDate()}-1200`);
    expect(preference.slotLabel).toMatch(/^12:00/);
  });
});

function pickupAvailability() {
  const requestedDate = earliestNewYorkDeliveryDate();
  return {
    available: true,
    source: "MOCK",
    locationId: "store-3rd-avenue",
    requestedDate,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    availableSlots: [
      { id: `pickup-test-store-3rd-avenue-${requestedDate}-1000`, startsAt: `${requestedDate}T10:00:00-04:00`, endsAt: `${requestedDate}T12:00:00-04:00`, label: "10:00 AM–12:00 PM" },
      { id: `pickup-test-store-3rd-avenue-${requestedDate}-1200`, startsAt: `${requestedDate}T12:00:00-04:00`, endsAt: `${requestedDate}T15:00:00-04:00`, label: "12:00–3:00 PM" }
    ]
  };
}
