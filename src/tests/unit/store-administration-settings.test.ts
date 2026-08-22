/** Verifies validation boundaries for business and tax-estimate administration. */

import { describe, expect, it } from "vitest";
import { defaultStoreAdministrationSettings } from "@/config/store-administration.config";
import { storeAdministrationSettingsSchema } from "@/server/admin/store-administration-settings-service";

describe("store administration settings", () => {
  it("accepts the reviewed Square-controlled defaults", () => {
    expect(storeAdministrationSettingsSchema.safeParse(defaultStoreAdministrationSettings).success).toBe(true);
  });

  it("rejects invalid contact data and unsafe estimate rates", () => {
    const parsed = storeAdministrationSettingsSchema.safeParse({
      ...defaultStoreAdministrationSettings,
      business: { ...defaultStoreAdministrationSettings.business, supportEmail: "not-an-email" },
      tax: { ...defaultStoreAdministrationSettings.tax, estimateRatePercent: 26 }
    });

    expect(parsed.success).toBe(false);
  });
});
