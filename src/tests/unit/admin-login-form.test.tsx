// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("production Admin login form", () => {
  it("never renders administrative configuration state", () => {
    render(<AdminLoginForm returnTo="/admin" />);

    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Admin credentials are not configured yet");
    expect(document.body.textContent).not.toContain("Admin login has not been configured");
  });

  it("does not surface an unexpected server-side detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: false, error: "DATABASE_URL is missing" }),
      { status: 503, headers: { "content-type": "application/json" } }
    )));
    render(<AdminLoginForm returnTo="/admin" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    expect((await screen.findByText("Unable to sign in. Please try again.")).textContent).not.toContain("DATABASE_URL");
  });
});
