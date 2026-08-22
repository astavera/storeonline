/** Verifies client-side confirmation and successful Admin password replacement UX. */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminResetPasswordForm } from "@/components/admin/admin-reset-password-form";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminResetPasswordForm", () => {
  it("does not transmit mismatched passwords", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminResetPasswordForm token={"t".repeat(43)} valid />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-secure-new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert").textContent).toContain("Passwords do not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows completion only after the API accepts the single-use token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    render(<AdminResetPasswordForm token={"t".repeat(43)} valid />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-secure-new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-secure-new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText(/Password updated/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue to login" })).toBeTruthy();
  });
});
