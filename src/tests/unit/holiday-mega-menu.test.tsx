/** Verifies the interactive Holidays navigation menu. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HolidayMegaMenu } from "@/components/layout/holiday-mega-menu";

const link = { id: "holidays", label: "Holidays", href: "/holidays/halloween", visible: true };
const holidayItems = [
  { slug: "halloween", label: "Halloween" },
  { slug: "christmas", label: "Christmas" }
];

describe("HolidayMegaMenu", () => {
  afterEach(cleanup);

  it("opens a full holiday collection menu and closes with Escape", () => {
    render(<HolidayMegaMenu holidays={holidayItems} link={link} />);

    expect(screen.queryByRole("link", { name: "Holidays" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Holidays" }));
    expect(screen.getByRole("group", { name: "Holiday collections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Halloween" }).getAttribute("href")).toBe("/holidays/halloween");
    expect(screen.queryByRole("link", { name: "View all holidays" })).toBeNull();
    expect(screen.getByRole("group", { name: "Holiday collections" }).querySelector('[data-dropdown-grid="holidays"]')?.getAttribute("data-max-rows")).toBe("6");

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Holidays" }));
    expect(screen.getByRole("group", { name: "Holiday collections" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Holiday collections" })).toBeNull();
  });
});
