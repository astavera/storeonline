// @vitest-environment jsdom

/** Verifies the bell's one-shot loading and unavailable/read interactions. */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminNotificationBell } from "@/components/admin/admin-notification-bell";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdminNotificationBell", () => {
  it("renders the explicit unavailable state without making a request when initial state is supplied", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminNotificationBell initialFeed={{ available: false, items: [], unreadCount: 0, lastSeenAt: null }} />);

    fireEvent.click(screen.getByRole("button", { name: "Storefront updates unavailable" }));

    expect(screen.getByText(/unavailable until database Admin identity is enabled/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads once without polling and renders only the safe feed projection", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        available: true,
        unreadCount: 1,
        lastSeenAt: null,
        items: [{
          id: "audit-1",
          category: "navigation",
          title: "Navigation updated",
          summary: "Storefront navigation was saved or published.",
          href: "/admin/navigation",
          occurredAt: "2026-08-19T12:00:00.000Z",
          read: false
        }]
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminNotificationBell />);

    const button = await screen.findByRole("button", { name: "1 unread Storefront update" });
    fireEvent.click(button);

    expect(screen.getByRole("link", { name: /Navigation updated/i })).toHaveAttribute("href", "/admin/navigation");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the current feed read through the fixed API action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, lastSeenAt: "2026-08-19T15:30:00.000Z" })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminNotificationBell initialFeed={{
      available: true,
      unreadCount: 1,
      lastSeenAt: null,
      items: [{
        id: "audit-1",
        category: "media",
        title: "Media library updated",
        summary: "A storefront media asset changed.",
        href: "/admin/media",
        occurredAt: "2026-08-19T12:00:00.000Z",
        read: false
      }]
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "1 unread Storefront update" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "0 unread Storefront updates" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/storefront-notifications", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "mark_all_read" })
    }));
  });
});
