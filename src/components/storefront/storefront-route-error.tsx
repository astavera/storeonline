/**
 * Provides a recoverable storefront route error state.
 */

"use client";

import Link from "next/link";

export function StorefrontRouteError({ reset, title }: { reset: () => void; title: string }) {
  return (
    <main className="container-shell py-16 text-center">
      <h1 className="font-display text-3xl font-black text-primary">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-secondary">The storefront could not load this collection. Your cart, account, and order data were not changed.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button className="inline-flex min-h-11 items-center rounded-pill bg-navy px-6 py-3 text-sm font-black text-white" onClick={reset} type="button">Try again</button>
        <Link className="inline-flex min-h-11 items-center rounded-pill border border-navy px-6 py-3 text-sm font-black text-navy" href="/shop">Shop all products</Link>
      </div>
    </main>
  );
}
