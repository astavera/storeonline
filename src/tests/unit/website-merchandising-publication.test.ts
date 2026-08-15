/**
 * Verifies the isolated behavior of website merchandising publication.
 */

import { describe, expect, it } from "vitest";
import {
  planWebsiteMerchandisingPublication,
  planWebsiteMerchandisingRollback
} from "@/server/admin/website-merchandising-publication";
import { planNoShippingDraft } from "@/server/admin/website-merchandising-draft-preparation";

describe("website merchandising publication", () => {
  it("produces a digest-bound confirmation only for publication-ready visible placements", () => {
    const payload = merchandisingPayload(true);
    const plan = planWebsiteMerchandisingPublication({ status: "DRAFT", versionNumber: 1, payload });

    expect(plan).toMatchObject({
      sourceStatus: "DRAFT",
      sourceVersion: 1,
      visiblePlacements: 1,
      readyPlacements: 1,
      canPublish: true,
      alreadyPublished: false
    });
    expect(plan.confirmation).toBe(`modern-state-publish-merchandising-v1-${plan.digest}`);
    expect(plan.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(planWebsiteMerchandisingPublication({ status: "DRAFT", versionNumber: 1, payload }, payload).alreadyPublished).toBe(true);
  });

  it("fails the publication plan when a visible placement references a disabled category", () => {
    const plan = planWebsiteMerchandisingPublication({
      status: "DRAFT",
      versionNumber: 2,
      payload: merchandisingPayload(false)
    });

    expect(plan).toMatchObject({ visiblePlacements: 1, readyPlacements: 0, canPublish: false });
  });

  it("binds rollback confirmation to the exact current and previous versions", () => {
    const current = { status: "PUBLISHED", versionNumber: 2, payload: merchandisingPayload(true) };
    const emptyBaseline = {
      status: "PUBLISHED",
      versionNumber: 1,
      payload: { version: 3, updatedAt: "2026-07-16T01:05:26.128Z", categories: [], brands: [], holidays: [], placements: [] }
    };
    const plan = planWebsiteMerchandisingRollback(current, emptyBaseline);

    expect(plan).toMatchObject({
      currentPublishedVersion: 2,
      targetPublishedVersion: 1,
      currentVisiblePlacements: 1,
      targetVisiblePlacements: 0,
      canRollback: true,
      alreadyRolledBack: false
    });
    expect(plan.confirmation).toMatch(/^modern-state-rollback-merchandising-v1-[a-f0-9]{64}$/);
    expect(planWebsiteMerchandisingRollback(current, current).canRollback).toBe(false);
  });

  it("prepares a new draft that removes shipping without making pickup unready", () => {
    const payload = merchandisingPayload(true);
    payload.placements[0].fulfillmentModes = ["pickup", "local-delivery", "shipping"];
    const plan = planNoShippingDraft({ status: "DRAFT", versionNumber: 4, payload });

    expect(plan).toMatchObject({
      sourceVersion: 4,
      visiblePlacements: 1,
      readyPlacements: 1,
      totalShippingPlacements: 1,
      visibleShippingPlacements: 1,
      canApply: true,
      alreadyPrepared: false
    });
    expect(plan.confirmation).toMatch(/^modern-state-prepare-no-shipping-draft-v1-[a-f0-9]{64}$/);

    payload.placements[0].fulfillmentModes = ["pickup", "local-delivery"];
    expect(planNoShippingDraft({ status: "DRAFT", versionNumber: 5, payload })).toMatchObject({
      totalShippingPlacements: 0,
      canApply: false,
      alreadyPrepared: true
    });
  });
});

function merchandisingPayload(categoryVisible: boolean) {
  return {
    version: 3,
    updatedAt: "2026-07-16T01:05:26.128Z",
    categories: [{
      id: "category-test",
      name: "Test",
      slug: "test",
      description: "Test category",
      parentId: null,
      visible: categoryVisible,
      sortOrder: 0
    }],
    brands: [],
    holidays: [],
    placements: [{
      squareVariationId: "variation-test",
      categoryIds: ["category-test"],
      brandIds: [],
      holidayAssignments: [],
      ageGroups: [],
      fulfillmentModes: ["pickup"],
      surfaceIds: ["shop"],
      visible: true,
      sortOrder: 0
    }]
  };
}
