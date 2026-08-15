/**
 * Renders the storefront fallback shown when a route cannot be found.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container-shell py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">404</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight">This page is not available.</h1>
      <p className="mt-4 max-w-xl text-secondary">Shop departments, balloons, holidays, or store locations from the main storefront.</p>
      <Link className="mt-8 inline-flex rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white" href="/shop">
        Go to shop
      </Link>
    </main>
  );
}
