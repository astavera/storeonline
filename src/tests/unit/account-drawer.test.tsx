/** Verifies the in-place customer account flow shared by desktop and mobile. */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAccountPanelOpen } from "@/components/customers/account-store";
import { AccountDrawer } from "@/components/layout/account-drawer";
import { AccountLink } from "@/components/layout/account-link";

afterEach(() => {
  setAccountPanelOpen(false);
  vi.unstubAllGlobals();
  cleanup();
});

describe("customer account drawer", () => {
  it("opens in place and completes the development OTP flow", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account" && !init?.method) {
        return response({ ok: true, account: null, developmentPreview: true });
      }
      if (url === "/api/account/auth/start") {
        return response({ ok: true, challengeId: "4d28c2fc-ddab-4d1b-aabf-a8b0ed078900", maskedEmail: "j•••@example.com", developmentCode: "123456" });
      }
      if (url === "/api/account/auth/verify") {
        return response({ ok: true, account: { id: "customer-1", email: "jane@example.com", firstName: null, marketingEmailConsent: true } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<><AccountLink /><AccountDrawer /></>);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));

    const drawer = await screen.findByRole("dialog", { name: "Your account" });
    expect(await within(drawer).findByText("Sign in or create an account")).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Continue as guest" })).not.toBeNull();

    fireEvent.change(within(drawer).getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.click(within(drawer).getByRole("checkbox", { name: /I agree to the/i }));
    fireEvent.click(within(drawer).getByRole("checkbox", { name: /Email me special offers/i }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Continue with email" }));

    expect(await within(drawer).findByText("Development preview")).not.toBeNull();
    const codeInput = within(drawer).getByLabelText("Verification code");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => expect(within(drawer).getByText("Communication preferences")).not.toBeNull());
    expect(within(drawer).getByText("jane@example.com")).not.toBeNull();
    expect((within(drawer).getByRole("checkbox", { name: "Email offers" }) as HTMLInputElement).checked).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function response(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body }) as Promise<Response>;
}
