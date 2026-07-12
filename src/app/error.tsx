"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container-shell py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">Error</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight">Something went wrong.</h1>
      <p className="mt-4 max-w-xl text-secondary">The storefront caught the issue without exposing sensitive details.</p>
      <button className="mt-8 rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
