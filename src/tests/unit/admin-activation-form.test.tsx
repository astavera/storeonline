/** Verifies protected Admin activation and local TOTP QR enrollment. */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminActivationForm } from "@/components/admin/admin-activation-form";

const invitation = {
  email: "owner@example.com",
  displayName: "Owner Example",
  role: "OWNER",
  expiresAt: "2026-08-24T15:24:47.531Z"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminActivationForm", () => {
  it("renders a local QR code from the server-issued TOTP provisioning URI", async () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const provisioningUri = `otpauth://totp/Modern%20State%20Admin:owner%40example.com?secret=${secret}&issuer=Modern%20State%20Admin&algorithm=SHA1&digits=6&period=30`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, secret, provisioningUri })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminActivationForm invitation={invitation} token={"t".repeat(43)} />);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-secure-owner-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a-secure-owner-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to authenticator" }));

    expect(await screen.findByRole("img", { name: "Scan this QR code with your authenticator app" })).toBeTruthy();
    expect(screen.getByText(secret)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/auth/activate",
      expect.objectContaining({ method: "POST" })
    );
  });
});
