/**
 * Implements the walking route distance fee service workflow for the fulfillment feature.
 */

export const walkingRouteDistanceFeeReasonCodes = [
  "QUOTED",
  "MANAGER_REVIEW",
  "INVALID_INPUT",
  "INVALID_POLICY"
] as const;

export type WalkingRouteDistanceFeeReasonCode =
  (typeof walkingRouteDistanceFeeReasonCodes)[number];

export type WalkingRouteDistanceFeeTier = {
  id: string;
  maximumDistanceFeet: number | null;
  feeCents: number;
};

export type WalkingRouteDistanceFeePolicy = {
  id: string;
  versionId: string;
  tiers: readonly WalkingRouteDistanceFeeTier[];
};

export type WalkingRouteDistanceFeeQuote = {
  policyId: string;
  policyVersionId: string;
  distanceFeet: number;
} & (
  | {
      quoted: true;
      reasonCode: "QUOTED";
      tierId: string;
      feeCents: number;
    }
  | {
      quoted: false;
      reasonCode: "MANAGER_REVIEW";
      maximumAutomaticDistanceFeet: number;
    }
  | {
      quoted: false;
      reasonCode: "INVALID_INPUT" | "INVALID_POLICY";
    }
);

export function quoteWalkingRouteDistanceFee(
  distanceFeet: number,
  policy: WalkingRouteDistanceFeePolicy
): WalkingRouteDistanceFeeQuote {
  const base = {
    policyId: policy.id,
    policyVersionId: policy.versionId,
    distanceFeet
  };

  if (!Number.isFinite(distanceFeet) || distanceFeet < 0) {
    return { ...base, quoted: false, reasonCode: "INVALID_INPUT" };
  }

  if (!isValidWalkingRouteDistanceFeePolicy(policy)) {
    return { ...base, quoted: false, reasonCode: "INVALID_POLICY" };
  }

  const tier = policy.tiers.find((candidate) =>
    candidate.maximumDistanceFeet == null || distanceFeet <= candidate.maximumDistanceFeet);
  if (tier) {
    return {
      ...base,
      quoted: true,
      reasonCode: "QUOTED",
      tierId: tier.id,
      feeCents: tier.feeCents
    };
  }

  const maximumAutomaticDistanceFeet = policy.tiers[policy.tiers.length - 1].maximumDistanceFeet;
  if (maximumAutomaticDistanceFeet == null) {
    return { ...base, quoted: false, reasonCode: "INVALID_POLICY" };
  }

  return {
    ...base,
    quoted: false,
    reasonCode: "MANAGER_REVIEW",
    maximumAutomaticDistanceFeet
  };
}

export function isValidWalkingRouteDistanceFeePolicy(
  policy: WalkingRouteDistanceFeePolicy
) {
  if (policy.id.length === 0 || policy.versionId.length === 0 || policy.tiers.length === 0) {
    return false;
  }

  let previousMaximum = -1;
  let previousFee = -1;
  const tierIds = new Set<string>();

  for (const [index, tier] of policy.tiers.entries()) {
    const maximumDistanceFeet = tier.maximumDistanceFeet;
    if (tier.id.length === 0
      || tierIds.has(tier.id)
      || !Number.isInteger(tier.feeCents)
      || tier.feeCents < previousFee) {
      return false;
    }

    if (maximumDistanceFeet == null) {
      if (index !== policy.tiers.length - 1) return false;
    } else if (!Number.isFinite(maximumDistanceFeet)
      || maximumDistanceFeet <= 0
      || maximumDistanceFeet <= previousMaximum) {
      return false;
    }

    tierIds.add(tier.id);
    if (maximumDistanceFeet != null) previousMaximum = maximumDistanceFeet;
    previousFee = tier.feeCents;
  }

  return true;
}
