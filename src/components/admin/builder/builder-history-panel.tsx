/**
 * Displays saved editing-history entries for the administrative page builder.
 */

"use client";

import type { BuilderDocumentHistoryEntry } from "./types";

export function BuilderHistoryPanel({ history, onRestore }: { history: BuilderDocumentHistoryEntry[]; onRestore: (version: number) => void }) {
  return (
    <div className="grid gap-2">
      {history.map((entry) => (
        <article className="rounded-md border border-border bg-surface-muted p-3" key={`${entry.version}-${entry.updatedAt}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Version {entry.version}</p>
            <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-semibold">{entry.status}</span>
          </div>
          <p className="mt-1 text-sm text-secondary">{entry.title}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-secondary">{formatDate(entry.updatedAt)}</p>
            <button className="min-h-11 rounded-full border border-border bg-surface px-4 text-xs font-semibold text-primary transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue" onClick={() => onRestore(entry.version)} type="button">
              Restore draft
            </button>
          </div>
        </article>
      ))}
      {history.length === 0 ? <p className="rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary">No versions saved in this builder session yet.</p> : null}
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
