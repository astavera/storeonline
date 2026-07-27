// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  SearchableMultiSelect,
  SearchableSingleSelect,
  filterSearchableOptions,
  type SearchableSelectOption
} from "@/components/admin/searchable-select";

const vendorOptions = [
  { id: "vendor-1", label: "30 Second Dance Party" },
  { id: "vendor-2", label: "Café Supplies" },
  { id: "vendor-3", label: "Imported vendor", disabled: true }
] as const satisfies ReadonlyArray<SearchableSelectOption>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("searchable admin selects", () => {
  it("filters without case or accent sensitivity", () => {
    expect(filterSearchableOptions(vendorOptions, "CAFE").map((option) => option.id)).toEqual(["vendor-2"]);
  });

  it("keeps search inside the original single-select bar and supports keyboard selection", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <SearchableSingleSelect
          allLabel="All Square vendors"
          label="Filter by Square vendor"
          onChange={setValue}
          options={vendorOptions}
          searchLabel="Search vendors"
          value={value}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Filter by Square vendor" }));

    const search = screen.getByRole("combobox", { name: "Search vendors" });
    expect(search.closest("div")?.className).not.toContain("shadow-");
    fireEvent.change(search, { target: { value: "cafe" } });
    expect(screen.getByRole("option", { name: "Café Supplies" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "30 Second Dance Party" })).toBeNull();

    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("combobox", { name: "Filter by Square vendor" }).textContent).toContain("Café Supplies");
  });

  it("skips disabled options and restores focus after Escape", async () => {
    render(
      <SearchableSingleSelect
        allLabel="Choose a Square vendor"
        label="Square vendor to import"
        onChange={() => undefined}
        options={vendorOptions}
        value=""
      />
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Square vendor to import" }));
    const disabledOption = screen.getByRole("option", { name: "Imported vendor" });
    expect((disabledOption as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search square vendor to import" }), { key: "Escape" });
    const trigger = await screen.findByRole("combobox", { name: "Square vendor to import" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("supports compact searchable multi-selection without closing after each choice", () => {
    function Harness() {
      const [values, setValues] = useState<string[]>([]);
      return (
        <SearchableMultiSelect
          label="Website categories"
          onToggle={(id) => setValues((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
          options={[
            { id: "balloons", label: "Balloons" },
            { id: "balloons-numbers", label: "Balloons › Numbers" },
            { id: "costumes", label: "Costumes" }
          ]}
          values={values}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Website categories selection" }));
    const search = screen.getByRole("combobox", { name: "Search website categories" });
    fireEvent.change(search, { target: { value: "numbers" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByRole("option", { name: "Balloons › Numbers" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Search website categories" })).toBeTruthy();
    expect(screen.getByLabelText("1 selected")).toBeTruthy();
  });
});
