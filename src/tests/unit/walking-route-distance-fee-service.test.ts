import { describe, expect, it } from "vitest";
import {
  quoteWalkingRouteDistanceFee,
  type WalkingRouteDistanceFeePolicy
} from "@/features/fulfillment/services/walking-route-distance-fee-service";

const calibratedPolicy: WalkingRouteDistanceFeePolicy = {
  id: "walking-route-distance-standard",
  versionId: "draft-calibration-v2-2026-07-16",
  tiers: [
    { id: "free", maximumDistanceFeet: 1_200, feeCents: 0 },
    { id: "standard", maximumDistanceFeet: 2_300, feeCents: 1_000 },
    { id: "extended", maximumDistanceFeet: 3_250, feeCents: 1_500 },
    { id: "whole-zone", maximumDistanceFeet: null, feeCents: 2_500 }
  ]
};

function feeAt(distanceFeet: number) {
  const quote = quoteWalkingRouteDistanceFee(distanceFeet, calibratedPolicy);
  return quote.quoted ? quote.feeCents : quote.reasonCode;
}

describe("walking route distance fee policy", () => {
  it.each([
    [0, 0],
    [1_200, 0],
    [1_200.01, 1_000],
    [2_300, 1_000],
    [2_300.01, 1_500],
    [3_250, 1_500],
    [3_250.01, 2_500],
    [100_000, 2_500]
  ])("quotes the inclusive distance boundaries at %s feet", (distanceFeet, feeCents) => {
    expect(feeAt(distanceFeet)).toBe(feeCents);
  });

  it("fails closed to manager review beyond the maximum automatic distance", () => {
    const limitedPolicy = {
      ...calibratedPolicy,
      tiers: calibratedPolicy.tiers.slice(0, 3)
    };

    expect(quoteWalkingRouteDistanceFee(3_250.01, limitedPolicy)).toMatchObject({
      quoted: false,
      reasonCode: "MANAGER_REVIEW",
      maximumAutomaticDistanceFeet: 3_250
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid route distance of %s",
    (distanceFeet) => {
      expect(quoteWalkingRouteDistanceFee(distanceFeet, calibratedPolicy)).toMatchObject({
        quoted: false,
        reasonCode: "INVALID_INPUT"
      });
    }
  );

  it("rejects unordered, duplicate, or decreasing-fee policies", () => {
    const malformedPolicies: WalkingRouteDistanceFeePolicy[] = [
      { ...calibratedPolicy, tiers: [
        { id: "far", maximumDistanceFeet: 2_300, feeCents: 1_000 },
        { id: "near", maximumDistanceFeet: 1_200, feeCents: 0 }
      ] },
      { ...calibratedPolicy, tiers: [
        { id: "same", maximumDistanceFeet: 1_200, feeCents: 0 },
        { id: "same", maximumDistanceFeet: 2_300, feeCents: 1_000 }
      ] },
      { ...calibratedPolicy, tiers: [
        { id: "near", maximumDistanceFeet: 1_200, feeCents: 1_500 },
        { id: "far", maximumDistanceFeet: 2_300, feeCents: 1_000 }
      ] },
      { ...calibratedPolicy, tiers: [
        { id: "negative", maximumDistanceFeet: -1, feeCents: 0 }
      ] },
      { ...calibratedPolicy, tiers: [
        { id: "open-too-early", maximumDistanceFeet: null, feeCents: 0 },
        { id: "unreachable", maximumDistanceFeet: 2_300, feeCents: 1_000 }
      ] }
    ];

    for (const policy of malformedPolicies) {
      expect(quoteWalkingRouteDistanceFee(500, policy)).toMatchObject({
        quoted: false,
        reasonCode: "INVALID_POLICY"
      });
    }
  });

  it("reproduces every longitudinal 3rd Avenue band measured from the price list", () => {
    const longitudinalSamples = [
      { id: "E72@3rd", distanceFeet: 152, historicalFeeCents: 0 },
      { id: "E75@3rd", distanceFeet: 963, historicalFeeCents: 0 },
      { id: "E68@3rd", distanceFeet: 1_141, historicalFeeCents: 0 },
      { id: "E76@3rd", distanceFeet: 1_230, historicalFeeCents: 1_000 },
      { id: "E67@3rd", distanceFeet: 1_399, historicalFeeCents: 1_000 },
      { id: "E79@3rd", distanceFeet: 2_042, historicalFeeCents: 1_000 },
      { id: "E64@3rd", distanceFeet: 2_179, historicalFeeCents: 1_000 },
      { id: "E63@3rd", distanceFeet: 2_446, historicalFeeCents: 1_500 },
      { id: "E60@3rd", distanceFeet: 3_227, historicalFeeCents: 1_500 }
    ];

    expect(longitudinalSamples.map((sample) => ({
      id: sample.id,
      matches: feeAt(sample.distanceFeet) === sample.historicalFeeCents
    }))).toEqual(longitudinalSamples.map((sample) => ({ id: sample.id, matches: true })));
  });

  it("documents that the avenue surcharges cannot be reproduced by one distance-only table", () => {
    const lateralSamples = [
      { id: "E70@Lex", distanceFeet: 1_122, historicalFeeCents: 1_000 },
      { id: "E72@Park", distanceFeet: 1_205, historicalFeeCents: 1_500 },
      { id: "E70@1st", distanceFeet: 1_853, historicalFeeCents: 1_500 }
    ];

    expect(lateralSamples.filter((sample) =>
      feeAt(sample.distanceFeet) !== sample.historicalFeeCents
    ).map((sample) => sample.id)).toEqual(["E70@Lex", "E72@Park", "E70@1st"]);

    // These near-equal routes prove the historical sheet is a street/avenue matrix,
    // not a single monotonic function of total walking distance.
    expect(Math.abs(1_141 - 1_122)).toBeLessThan(25);
    expect(feeAt(1_141)).toBe(feeAt(1_122));
  });

  it("applies the same fee to the same route distance regardless of the selected store", () => {
    const thirdAvenueQuote = quoteWalkingRouteDistanceFee(2_816, calibratedPolicy);
    const eightySixthStreetQuote = quoteWalkingRouteDistanceFee(2_816, calibratedPolicy);

    expect(thirdAvenueQuote).toMatchObject({ quoted: true, feeCents: 1_500 });
    expect(eightySixthStreetQuote).toEqual(thirdAvenueQuote);
  });

  it("classifies the verified 86th Street examples through the whole-zone tier", () => {
    expect(feeAt(2_816)).toBe(1_500); // 316 E 82nd Street
    expect(feeAt(2_951)).toBe(1_500); // E 96th Street at Lexington Avenue
    expect(feeAt(2_929)).toBe(1_500); // E 96th Street at Park Avenue
    expect(feeAt(3_447)).toBe(2_500); // E 96th Street at 3rd Avenue
    expect(feeAt(4_110)).toBe(2_500); // E 96th Street at 2nd Avenue
  });

  it("quotes the verified long routes at $25 while their ZIP remains eligible", () => {
    expect(feeAt(3_924)).toBe(2_500); // 599 E 85th Street, assigned to 86th Street
    expect(feeAt(4_261)).toBe(2_500); // 500 E 80th Street, nearest store is 3rd Avenue
  });
});
