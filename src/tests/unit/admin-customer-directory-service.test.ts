/** Verifies minimized customer profiles, filtering and activity counts. */

import { describe, expect, it } from "vitest";
import {
  buildAdminCustomerSummaries,
  parseAdminCustomerQuery
} from "@/server/admin/admin-customer-directory-service";

describe("Admin customer directory", () => {
  it("bounds and normalizes customer filters", () => {
    expect(parseAdminCustomerQuery(new URLSearchParams({
      page: "3",
      pageSize: "500",
      search: `  ${"x".repeat(200)}  `,
      consent: "unsubscribed",
      sort: "name"
    }))).toMatchObject({
      page: 3,
      pageSize: 50,
      search: "x".repeat(160),
      consent: "unsubscribed",
      sort: "name"
    });

    expect(parseAdminCustomerQuery({ consent: "invalid", sort: "invalid", page: "-1" })).toMatchObject({
      page: 1,
      consent: "all",
      sort: "recent"
    });
  });

  it("maps local order and hashed return counts without sensitive session data", () => {
    const summaries = buildAdminCustomerSummaries([{
      id: "customer-1",
      email: "Customer@Example.com",
      firstName: "Jamie",
      lastName: "Rivera",
      squareCustomerId: "square-customer-secret-reference",
      termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      termsVersion: "terms-v2",
      marketingEmailConsent: false,
      marketingConsentAt: new Date("2026-01-01T00:00:00.000Z"),
      marketingConsentVersion: "marketing-v1",
      marketingUnsubscribedAt: new Date("2026-02-01T00:00:00.000Z"),
      lastLoginAt: null,
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
      consentEvents: [{
        id: "consent-1",
        consentType: "EMAIL_MARKETING",
        granted: false,
        source: "account_preferences",
        policyVersion: "marketing-v1",
        occurredAt: new Date("2026-02-01T00:00:00.000Z")
      }],
      _count: { consentEvents: 3 }
    }], new Map([["customer@example.com", 4]]), new Map([["customer@example.com", 2]]));

    expect(summaries[0]).toMatchObject({
      displayName: "Jamie Rivera",
      email: "Customer@Example.com",
      squareProfileLinked: true,
      marketing: { status: "UNSUBSCRIBED" },
      privacy: { consentEventCount: 3 },
      activity: { localOrderCount: 4, returnRequestCount: 2 }
    });
    const serialized = JSON.stringify(summaries[0]);
    expect(serialized).not.toContain("square-customer-secret-reference");
    expect(serialized).not.toMatch(/token|session|challenge|payment/i);
  });

  it("marks return counts unavailable instead of inventing data", () => {
    const summaries = buildAdminCustomerSummaries([{
      id: "customer-2",
      email: "second@example.com",
      firstName: null,
      lastName: null,
      squareCustomerId: null,
      termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      termsVersion: "terms-v1",
      marketingEmailConsent: false,
      marketingConsentAt: null,
      marketingConsentVersion: null,
      marketingUnsubscribedAt: null,
      lastLoginAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      consentEvents: [],
      _count: { consentEvents: 0 }
    }], new Map(), null);

    expect(summaries[0].activity).toMatchObject({ localOrderCount: 0, returnRequestCount: null });
  });
});
