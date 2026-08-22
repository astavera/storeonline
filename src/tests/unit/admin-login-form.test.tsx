// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("admin production login form", () => {
  it("submits the secure legacy bootstrap form and honors the safe return path", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, returnTo: "/admin/products" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminLoginForm configured returnTo="/admin/products" />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/products"));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/auth/login", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Protected by encrypted sessions and attempt limits.")).toBeTruthy();
  });

  it("supports authenticator and one-time recovery codes in database identity mode", async () => {
    let submittedBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ ok: true, returnTo: "/admin" });
    }));
    render(<AdminLoginForm configured databaseIdentity returnTo="/admin" />);

    expect(screen.getByLabelText("6-digit authenticator code")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recovery code" }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("One-time recovery code"), { target: { value: "RECOVERY-123" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    await waitFor(() => expect(submittedBody).toMatchObject({
      email: "owner@example.com",
      password: "correct-password",
      mfaCode: "RECOVERY-123",
      returnTo: "/admin"
    }));
    expect(screen.getByText("Protected by MFA, encrypted sessions and attempt limits.")).toBeTruthy();
  });

  it("shows a useful retry window after the server rate limits attempts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: false, error: "Too many login attempts." }),
      { status: 429, headers: { "content-type": "application/json", "retry-after": "90" } }
    )));
    render(<AdminLoginForm configured returnTo="/admin" />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toContain("Try again in 2 minutes.");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
