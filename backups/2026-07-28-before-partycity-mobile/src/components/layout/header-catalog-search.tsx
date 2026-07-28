"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ExpandableSearchBar from "@/components/ui/expandable-search-bar";

export function HeaderCatalogSearch({ label = "Search" }: { label?: string }) {
  const router = useRouter();
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const compactSearchRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!compactSearchRef.current?.contains(event.target as Node)) {
        setCompactSearchOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCompactSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function searchCatalog(query: string) {
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function submitCompactSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("q") ?? "").trim();

    if (query) {
      searchCatalog(query);
    }
  }

  return (
    <span className="relative z-30 inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible" data-header-nav-id="search" ref={compactSearchRef}>
      <button
        aria-controls="compact-header-search"
        aria-expanded={compactSearchOpen}
        aria-label={compactSearchOpen ? "Close search" : label}
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full p-0 text-black transition-colors hover:bg-red/10 hover:text-red 2xl:hidden"
        onClick={() => setCompactSearchOpen((current) => !current)}
        type="button"
      >
        {compactSearchOpen ? <X aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={2} /> : <Search aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={2} />}
        <span className="sr-only">{label}</span>
      </button>
      {compactSearchOpen ? (
        <form
          className="absolute right-0 top-[calc(100%+1rem)] z-40 flex w-[min(360px,calc(100vw-2rem))] items-center rounded-full border border-border bg-surface p-1.5 text-primary shadow-card 2xl:hidden"
          id="compact-header-search"
          onSubmit={submitCompactSearch}
          role="search"
        >
          <label className="sr-only" htmlFor="compact-header-search-input">
            Search products
          </label>
          <Search aria-hidden="true" className="ml-3 shrink-0 text-secondary" size={19} />
          <input
            autoComplete="off"
            autoFocus
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold outline-none placeholder:text-text-muted focus-visible:!outline-none"
            id="compact-header-search-input"
            name="q"
            placeholder="Search products..."
            type="search"
          />
          <button className="rounded-full bg-red px-4 py-2 text-sm font-black text-white hover:bg-blue" type="submit">
            Search
          </button>
        </form>
      ) : null}
      <span className="hidden h-10 w-10 shrink-0 2xl:inline-flex">
        <ExpandableSearchBar
          buttonClassName="border-transparent bg-transparent text-black hover:bg-red/10 hover:text-red"
          expandDirection="left"
          formClassName="border-white/30"
          inputId="wide-header-catalog-search"
          onSearch={searchCatalog}
          placeholder="Search products..."
          width={300}
        />
      </span>
    </span>
  );
}
