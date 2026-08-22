/**
 * Renders the searchable select interface and its user interactions.
 */

"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from "react";

export type SearchableSelectOption<T extends string = string> = {
  id: T;
  label: string;
  disabled?: boolean;
};

type SharedSearchableSelectProps<T extends string> = {
  className?: string;
  disabled?: boolean;
  label: string;
  options: ReadonlyArray<SearchableSelectOption<T>>;
  searchLabel?: string;
};

type SearchableSingleSelectProps<T extends string> = SharedSearchableSelectProps<T> & {
  allLabel: string;
  onChange: (value: T | "") => void;
  value: T | "";
};

type SearchableMultiSelectProps<T extends string> = SharedSearchableSelectProps<T> & {
  emptyLabel?: string;
  onToggle: (value: T) => void;
  values: readonly T[];
};

const controlClassName = "admin-form-control min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none";

export function SearchableSingleSelect<T extends string>({
  allLabel,
  className = "",
  disabled = false,
  label,
  onChange,
  options,
  searchLabel = `Search ${label.toLowerCase()}`,
  value
}: SearchableSingleSelectProps<T>) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(() => filterSearchableOptions(options, search), [options, search]);
  const availableOptions = useMemo<ReadonlyArray<SearchableSelectOption<T | "">>>(() => [
    ...(search ? [] : [{ id: "" as const, label: allLabel }]),
    ...filteredOptions.filter((option) => !option.disabled)
  ], [allLabel, filteredOptions, search]);
  const selectedLabel = options.find((option) => option.id === value)?.label ?? allLabel;
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, availableOptions.length - 1));
  const activeOption = availableOptions[safeActiveIndex];
  const activeOptionId = activeOption ? optionId(listboxId, activeOption.id) : undefined;

  useDropdownDismissal(open, containerRef, () => close(false));

  function openDropdown() {
    if (disabled) return;
    const selectedIndex = availableOptions.findIndex((option) => option.id === value);
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    setSearch("");
    if (restoreFocus) setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function select(nextValue: T | "") {
    onChange(nextValue);
    close(true);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(() => nextActiveIndex(event.key, safeActiveIndex, availableOptions.length));
      return;
    }
    if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      select(activeOption.id);
    }
  }

  return (
    <div className={`relative min-w-0 ${className}`} ref={containerRef}>
      {open ? (
        <div className={`${controlClassName} flex items-center gap-2 bg-surface focus-within:border-primary`}>
          <Search aria-hidden="true" className="shrink-0 text-secondary" size={16} />
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label={searchLabel}
            autoFocus
            className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-secondary"
            data-dropdown-search-input
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={`${searchLabel}...`}
            role="combobox"
            type="search"
            value={search}
          />
          <span aria-label={`${filteredOptions.length} matches`} className="shrink-0 rounded-pill bg-surface-muted px-2 py-1 text-[10px] font-black text-secondary">
            {filteredOptions.length}
          </span>
          <button aria-label={`Close ${label.toLowerCase()}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-surface-muted hover:text-primary" onClick={() => close(true)} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : (
        <button
          aria-controls={listboxId}
          aria-expanded="false"
          aria-haspopup="listbox"
          aria-label={label}
          className={`${controlClassName} flex items-center justify-between gap-3 text-left hover:border-primary disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={disabled}
          onClick={openDropdown}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
              event.preventDefault();
              openDropdown();
            }
          }}
          ref={triggerRef}
          role="combobox"
          type="button"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown aria-hidden="true" className="shrink-0" size={16} />
        </button>
      )}

      {open ? (
        <div className="admin-dropdown-panel absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-xl">
          <div aria-label={`${label} options`} className="max-h-64 overflow-y-auto" id={listboxId} role="listbox">
            {!search ? (
              <button aria-selected={!value} className={optionClassName(!value, activeOption?.id === "")} id={optionId(listboxId, "")} onClick={() => select("")} onMouseEnter={() => setActiveIndex(0)} role="option" type="button">
                <span>{allLabel}</span>
                {!value ? <Check aria-hidden="true" size={15} /> : null}
              </button>
            ) : null}
            {filteredOptions.map((option) => {
              const selected = option.id === value;
              const active = option.id === activeOption?.id;
              return (
                <button
                  aria-disabled={option.disabled || undefined}
                  aria-selected={selected}
                  className={optionClassName(selected, active, option.disabled)}
                  disabled={option.disabled}
                  id={optionId(listboxId, option.id)}
                  key={option.id}
                  onClick={() => select(option.id)}
                  onMouseEnter={() => {
                    const index = availableOptions.findIndex((candidate) => candidate.id === option.id);
                    if (index >= 0) setActiveIndex(index);
                  }}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                  {selected ? <Check aria-hidden="true" size={15} /> : null}
                </button>
              );
            })}
            {filteredOptions.length === 0 ? <EmptySearch search={search} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SearchableMultiSelect<T extends string>({
  className = "",
  disabled = false,
  emptyLabel = "Choose options",
  label,
  onToggle,
  options,
  searchLabel = `Search ${label.toLowerCase()}`,
  values
}: SearchableMultiSelectProps<T>) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(() => filterSearchableOptions(options, search), [options, search]);
  const availableOptions = useMemo(() => filteredOptions.filter((option) => !option.disabled), [filteredOptions]);
  const selectedLabels = options.filter((option) => values.includes(option.id)).map((option) => option.label);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, availableOptions.length - 1));
  const activeOption = availableOptions[safeActiveIndex];
  const activeOptionId = activeOption ? optionId(listboxId, activeOption.id) : undefined;
  const summary = selectedLabels.length === 0 ? emptyLabel : selectedLabels.length <= 2 ? selectedLabels.join(", ") : `${selectedLabels.length} selected`;

  useDropdownDismissal(open, containerRef, () => close(false));

  function openDropdown() {
    if (!disabled) {
      setActiveIndex(0);
      setOpen(true);
    }
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    setSearch("");
    if (restoreFocus) setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(() => nextActiveIndex(event.key, safeActiveIndex, availableOptions.length));
      return;
    }
    if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      onToggle(activeOption.id);
    }
  }

  return (
    <div className={`relative min-w-0 ${className}`} ref={containerRef}>
      {open ? (
        <div className={`${controlClassName} flex items-center gap-2 bg-surface focus-within:border-primary`}>
          <Search aria-hidden="true" className="shrink-0 text-secondary" size={16} />
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label={searchLabel}
            autoFocus
            className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-secondary"
            data-dropdown-search-input
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={`${searchLabel}...`}
            role="combobox"
            type="search"
            value={search}
          />
          <span aria-label={`${selectedLabels.length} selected`} className={`shrink-0 rounded-pill px-2 py-1 text-[10px] font-black ${selectedLabels.length ? "bg-primary text-white" : "bg-surface-muted text-secondary"}`}>
            {selectedLabels.length}
          </span>
          <button aria-label={`Close ${label.toLowerCase()} selection`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-surface-muted hover:text-primary" onClick={() => close(true)} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : (
        <button
          aria-controls={listboxId}
          aria-expanded="false"
          aria-haspopup="listbox"
          aria-label={`${label} selection`}
          className={`${controlClassName} flex items-center justify-between gap-3 text-left hover:border-primary disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={disabled}
          onClick={openDropdown}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
              event.preventDefault();
              openDropdown();
            }
          }}
          ref={triggerRef}
          role="combobox"
          type="button"
        >
          <span className={`truncate ${selectedLabels.length ? "font-semibold text-primary" : "text-secondary"}`}>{summary}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-pill bg-surface-muted px-2 py-1 text-[10px] font-black">{selectedLabels.length}</span>
            <ChevronDown aria-hidden="true" size={16} />
          </span>
        </button>
      )}

      {open ? (
        <div className="admin-dropdown-panel absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-xl">
          <div aria-label={`${label} options`} aria-multiselectable="true" className="max-h-64 overflow-y-auto" id={listboxId} role="listbox">
            {filteredOptions.map((option) => {
              const selected = values.includes(option.id);
              const active = option.id === activeOption?.id;
              return (
                <button
                  aria-disabled={option.disabled || undefined}
                  aria-selected={selected}
                  className={optionClassName(selected, active, option.disabled)}
                  disabled={option.disabled}
                  id={optionId(listboxId, option.id)}
                  key={option.id}
                  onClick={() => onToggle(option.id)}
                  onMouseEnter={() => {
                    const index = availableOptions.findIndex((candidate) => candidate.id === option.id);
                    if (index >= 0) setActiveIndex(index);
                  }}
                  role="option"
                  type="button"
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? "border-white/50 bg-white/15" : "border-border bg-surface"}`}>
                    {selected ? <Check aria-hidden="true" size={13} /> : null}
                  </span>
                  <span>{option.label}</span>
                </button>
              );
            })}
            {filteredOptions.length === 0 ? <EmptySearch search={search} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function filterSearchableOptions<T extends string>(options: ReadonlyArray<SearchableSelectOption<T>>, search: string) {
  const normalizedSearch = normalizeSearchText(search);
  if (!normalizedSearch) return options;
  return options.filter((option) => normalizeSearchText(option.label).includes(normalizedSearch));
}

function useDropdownDismissal(open: boolean, containerRef: RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [close, containerRef, open]);
}

function nextActiveIndex(key: string, current: number, optionCount: number) {
  if (optionCount === 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowUp") return current <= 0 ? optionCount - 1 : current - 1;
  return current >= optionCount - 1 ? 0 : current + 1;
}

function optionClassName(selected: boolean, active = false, disabled = false) {
  return `flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm ${
    disabled
      ? "cursor-not-allowed text-secondary opacity-50"
      : selected
        ? "bg-primary text-white"
        : active
          ? "bg-surface-muted text-primary"
          : "hover:bg-surface-muted"
  }`;
}

function optionId(listboxId: string, id: string) {
  return `${listboxId}-option-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function EmptySearch({ search }: { search: string }) {
  return <p className="px-3 py-5 text-center text-xs font-semibold text-secondary">No matches for “{search}”.</p>;
}
