"use client";

import type { BuilderDocumentHistoryEntry } from "./types";

export function BuilderHistoryPanel({ history }: { history: BuilderDocumentHistoryEntry[] }) {
  return (
    <div className="grid gap-2">
      {history.map((entry) => (
        <article className="rounded-md border border-border bg-surface-muted p-3" key={`${entry.version}-${entry.updatedAt}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Version {entry.version}</p>
            <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-semibold">{entry.status}</span>
          </div>
          <p className="mt-1 text-sm text-secondary">{entry.title}</p>
          <p className="mt-2 text-xs text-secondary">{formatDate(entry.updatedAt)}</p>
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
