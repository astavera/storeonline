"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type NotificationItem = Readonly<{
  id: string;
  category: string;
  title: string;
  summary: string;
  href: string;
  occurredAt: string;
  read: boolean;
}>;

export type AdminNotificationBellFeed = Readonly<{
  available: boolean;
  items: readonly NotificationItem[];
  unreadCount: number;
  lastSeenAt: string | null;
  reason?: string;
}>;

type AdminNotificationBellProps = Readonly<{
  initialFeed?: AdminNotificationBellFeed;
  endpoint?: string;
}>;

const unavailableFeed: AdminNotificationBellFeed = {
  available: false,
  items: [],
  unreadCount: 0,
  lastSeenAt: null
};

/** Header-ready bell. It loads once, never polls, and stays inert when DB identity is unavailable. */
export function AdminNotificationBell({
  initialFeed,
  endpoint = "/api/admin/storefront-notifications"
}: AdminNotificationBellProps) {
  const attemptedInitialLoad = useRef(false);
  const [feed, setFeed] = useState<AdminNotificationBellFeed | null>(initialFeed ?? null);
  const [open, setOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [markError, setMarkError] = useState(false);

  useEffect(() => {
    if (initialFeed || attemptedInitialLoad.current) return;
    attemptedInitialLoad.current = true;
    void fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        const value: unknown = await response.json().catch(() => null);
        return isNotificationFeed(value) ? value : unavailableFeed;
      })
      .catch(() => unavailableFeed)
      .then(setFeed);
  }, [endpoint, initialFeed]);

  const loading = feed === null;
  const unreadCount = feed?.available ? Math.min(feed.unreadCount, 20) : 0;
  const label = loading
    ? "Loading Storefront updates"
    : feed?.available
      ? `${unreadCount} unread Storefront ${unreadCount === 1 ? "update" : "updates"}`
      : "Storefront updates unavailable";

  async function markAllRead() {
    if (!feed?.available || feed.unreadCount === 0 || markingRead) return;
    setMarkingRead(true);
    setMarkError(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "mark_all_read" })
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isMarkReadResult(result)) throw new Error("mark-read-failed");
      setFeed({
        ...feed,
        unreadCount: 0,
        lastSeenAt: result.lastSeenAt,
        items: feed.items.map((item) => ({ ...item, read: true }))
      });
    } catch {
      setMarkError(true);
    } finally {
      setMarkingRead(false);
    }
  }

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="relative inline-flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        disabled={loading}
        onClick={() => setOpen((value) => !value)}
        title={label}
        type="button"
      >
        <Bell aria-hidden="true" size={18} strokeWidth={1.8} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label="Storefront updates"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          role="dialog"
        >
          <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Storefront updates</p>
              <p className="text-xs text-slate-500">Recent publishing and configuration activity</p>
            </div>
            {feed?.available && feed.unreadCount > 0 ? (
              <button
                className="shrink-0 text-xs font-semibold text-slate-700 hover:text-slate-950 disabled:opacity-50"
                disabled={markingRead}
                onClick={() => void markAllRead()}
                type="button"
              >
                {markingRead ? "Marking…" : "Mark all read"}
              </button>
            ) : null}
          </header>

          <div aria-live="polite" className="max-h-[26rem] overflow-y-auto">
            {!feed?.available ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Storefront updates are unavailable until database Admin identity is enabled.
              </p>
            ) : feed.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No Storefront updates yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {feed.items.map((item) => (
                  <li key={item.id}>
                    <a className="block px-4 py-3 hover:bg-slate-50" href={item.href}>
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-slate-200" : "bg-blue-600"}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-600">{item.summary}</span>
                          <time className="mt-1 block text-[11px] text-slate-400" dateTime={item.occurredAt}>
                            {formatOccurredAt(item.occurredAt)}
                          </time>
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {markError ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-red-700">
                Updates could not be marked as read. Try again from this menu.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function isNotificationFeed(value: unknown): value is AdminNotificationBellFeed {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.available === false) return Array.isArray(record.items) && record.items.length === 0;
  return record.available === true && Array.isArray(record.items) && typeof record.unreadCount === "number";
}

function isMarkReadResult(value: unknown): value is { ok: true; lastSeenAt: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && typeof record.lastSeenAt === "string";
}

function formatOccurredAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York"
  }).format(date);
}
