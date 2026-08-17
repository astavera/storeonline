/** Verifies the interactive Toys and Party Supplies navigation menus. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepartmentMegaMenu, type DepartmentMenuContent } from "@/components/layout/department-mega-menu";

const toysLink = { id: "toys", label: "Toys", href: "/toys", visible: true };
const toysMenu: DepartmentMenuContent = {
  ariaLabel: "Toy categories",
  shopAllHref: "/toys",
  shopAllLabel: "Shop All Toys",
  items: [{ href: "/toys?category=dolls#catalog", label: "Dolls" }]
};

const partyLink = { id: "party-supplies", label: "Party Supplies", href: "/party-supplies", visible: true };
const partyMenu: DepartmentMenuContent = {
  ariaLabel: "Party Supplies categories",
  shopAllHref: "/party-supplies",
  shopAllLabel: "Shop All Party Supplies",
  groups: [{
    href: "/party-supplies?collection=licensed-party#catalog",
    label: "Licensed Party",
    items: [{ href: "/party-supplies?theme=disney#catalog", label: "Disney" }]
  }]
};

describe("DepartmentMegaMenu", () => {
  afterEach(cleanup);

  it("opens the Toys categories and keeps the parent as a button", () => {
    render(<DepartmentMegaMenu link={toysLink} menu={toysMenu} />);

    expect(screen.queryByRole("link", { name: "Toys" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Toys" }));
    expect(screen.getByRole("group", { name: "Toy categories" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Shop All Toys" }).getAttribute("href")).toBe("/toys");
    expect(screen.getByRole("link", { name: "Dolls" }).getAttribute("href")).toBe("/toys?category=dolls#catalog");

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Toys" }));
    expect(screen.getByRole("group", { name: "Toy categories" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Toy categories" })).toBeNull();
  });

  it("renders Party Supplies groups and category links", () => {
    render(<DepartmentMegaMenu link={partyLink} menu={partyMenu} />);

    fireEvent.click(screen.getByRole("button", { name: "Party Supplies" }));
    expect(screen.getByRole("link", { name: "Shop All Party Supplies" }).getAttribute("href")).toBe("/party-supplies");
    expect(screen.queryByRole("link", { name: "Disney" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Licensed Party" }));
    expect(screen.getByRole("link", { name: "Shop All Licensed Party" }).getAttribute("href")).toBe("/party-supplies?collection=licensed-party#catalog");
    expect(screen.getByRole("link", { name: "Disney" }).getAttribute("href")).toBe("/party-supplies?theme=disney#catalog");
  });
});
