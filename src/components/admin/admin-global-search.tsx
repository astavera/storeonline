/** Provides a self-contained command palette for permission-scoped Admin search. */

"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AdminGlobalSearchDomain,
  AdminGlobalSearchResponse,
  AdminGlobalSearchResult
} from "@/server/admin/admin-global-search-service";
import { cn } from "@/lib/utils";

type SearchApiResponse = AdminGlobalSearchResponse & {
  ok: boolean;
  error?: string;
  message?: string;
};

const domainOrder: AdminGlobalSearchDomain[] = ["catalog", "orders", "customers", "cms"];
const domainLabels: Record<AdminGlobalSearchDomain, string> = {
  catalog: "Products",
  orders: "Orders",
  customers: "Customers",
  cms: "Storefront pages"
};

export function AdminGlobalSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<AdminGlobalSearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2) return;

    const controller = new AbortController();
    const searchTimer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(`/api/admin/search?q=${encodeURIComponent(normalized)}`, { cache: "no-store", signal: controller.signal })
        .then(readSearchResponse)
        .then(setResponse)
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setResponse(null);
          setError(requestError instanceof Error ? requestError.message : "Admin search could not be loaded.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(searchTimer);
      controller.abort();
    };
  }, [open, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setResponse(null);
    setError("");
  }

  function changeQuery(value: string) {
    setQuery(value);
    setResponse(null);
    setError("");
    setLoading(value.trim().length >= 2);
  }

  return (
    <div className={cn("admin-global-search", className)} data-store-component="AdminGlobalSearch">
      <button className="admin-button-secondary admin-global-search-trigger" onClick={() => setOpen(true)} type="button">
        <Search aria-hidden="true" size={15} />
        Search admin
        <kbd className="admin-global-search-shortcut">Ctrl K</kbd>
      </button>

      {open ? (
        <div aria-label="Admin search" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-start bg-black/35 px-4 pt-[10vh]" role="dialog">
          <button aria-label="Close Admin search" className="absolute inset-0 cursor-default" onClick={close} type="button" />
          <section className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search aria-hidden="true" className="shrink-0 text-secondary" size={18} />
              <input
                aria-label="Search products, orders, customers, and pages"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-secondary"
                maxLength={100}
                onChange={(event) => changeQuery(event.target.value)}
                placeholder="Search products, orders, customers, and pages…"
                ref={inputRef}
                type="search"
                value={query}
              />
              <button aria-label="Close search" className="grid size-9 place-items-center rounded-md text-secondary hover:bg-surface-muted" onClick={close} type="button">
                <X aria-hidden="true" size={17} />
              </button>
            </div>

            <div aria-live="polite" className="max-h-[65vh] min-h-40 overflow-y-auto p-3">
              {query.trim().length < 2 ? <SearchMessage text="Enter at least 2 characters to search the Admin." /> : null}
              {loading ? <SearchMessage text="Searching authorized records…" /> : null}
              {!loading && error ? <SearchMessage error text={error} /> : null}
              {!loading && !error && response?.results.length === 0 ? <SearchMessage text="No matching records were found in your permitted areas." /> : null}
              {!loading && !error && response ? (
                <SearchResults onNavigate={close} response={response} />
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted px-4 py-2.5 text-[11px] text-secondary">
              <span>Results are restricted by your Admin permissions.</span>
              <span>Maximum 8 per area</span>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SearchResults({ onNavigate, response }: { onNavigate: () => void; response: AdminGlobalSearchResponse }) {
  return (
    <div className="grid gap-4">
      {domainOrder.map((domain) => {
        const results = response.results.filter((result) => result.domain === domain);
        if (results.length === 0) return null;
        return (
          <section aria-labelledby={`admin-search-${domain}`} key={domain}>
            <h2 className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-secondary" id={`admin-search-${domain}`}>
              {domainLabels[domain]}
            </h2>
            <div className="grid gap-1">
              {results.map((result) => <SearchResultLink key={result.id} onNavigate={onNavigate} result={result} />)}
            </div>
          </section>
        );
      })}
      {response.unavailableDomains.length > 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Some permitted areas are temporarily unavailable: {response.unavailableDomains.map((domain) => domainLabels[domain]).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function SearchResultLink({ onNavigate, result }: { onNavigate: () => void; result: AdminGlobalSearchResult }) {
  return (
    <Link className="rounded-md px-3 py-2.5 transition hover:bg-surface-muted focus:bg-surface-muted focus:outline-none" href={result.href} onClick={onNavigate}>
      <span className="block truncate text-sm font-semibold text-primary">{result.label}</span>
      <span className="mt-0.5 block truncate text-xs text-secondary">{result.subtitle}</span>
    </Link>
  );
}

function SearchMessage({ error = false, text }: { error?: boolean; text: string }) {
  return <p className={cn("grid min-h-32 place-items-center px-6 text-center text-sm text-secondary", error && "text-red-700")}>{text}</p>;
}

async function readSearchResponse(response: Response): Promise<AdminGlobalSearchResponse> {
  const payload = await response.json() as SearchApiResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.message || "Admin search could not be loaded.");
  return payload;
}
