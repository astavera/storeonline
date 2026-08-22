/** Verifies the focused Admin settings workspace avoids the removed generic page heading. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreSettingsManager } from "@/components/admin/store-settings-manager";
import {
  defaultStoreAdministrationSettings,
  storePolicyDefinitions
} from "@/config/store-administration.config";
import { createStorePolicyDocument } from "@/lib/cms/store-policy-document";

describe("store settings manager", () => {
  it("starts directly with the focused modules instead of a generic page title", () => {
    render(
      <StoreSettingsManager
        initialLocations={{ locations: [], persistenceAvailable: false, source: "configuration" }}
        initialPolicies={storePolicyDefinitions.map((definition) => ({
          definition,
          document: createStorePolicyDocument(definition)
        }))}
        initialSettings={{
          settings: defaultStoreAdministrationSettings,
          status: "DEFAULT",
          version: null,
          updatedAt: null,
          persistenceAvailable: true
        }}
      />
    );

    expect(screen.queryByRole("heading", { name: "Store settings" })).toBeNull();
    expect(screen.getAllByText("Business details").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Legal & policies/i })).toBeNull();
  });
});
