/** Verifies unfinished holiday routes remain on-page with a friendly placeholder. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HolidayComingSoon } from "@/features/holidays/components/holiday-coming-soon";

describe("holiday coming-soon state", () => {
  it("identifies the holiday without offering a redirect away from the page", () => {
    render(<HolidayComingSoon holidayName="Christmas" />);

    expect(screen.getByText("Christmas")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "You'll find products here very soon." })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
