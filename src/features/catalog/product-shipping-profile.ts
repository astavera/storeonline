/**
 * Defines the website-owned physical shipping profile for one Square variation.
 */

export type ProductShippingProfileDraft = {
  isShippable: boolean;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  packageWeightLb: string;
};

export type ProductShippingProfile = ProductShippingProfileDraft & {
  configured: boolean;
  shippingEnabled: boolean;
};

export const emptyProductShippingProfile: ProductShippingProfile = {
  configured: false,
  isShippable: true,
  packageLengthIn: "",
  packageWidthIn: "",
  packageHeightIn: "",
  packageWeightLb: "",
  shippingEnabled: false
};

const packageFields = [
  ["packageLengthIn", "package length"],
  ["packageWidthIn", "package width"],
  ["packageHeightIn", "package height"],
  ["packageWeightLb", "package weight"]
] as const;

export function productShippingProfileReadinessIssues(profile: ProductShippingProfileDraft) {
  const issues: string[] = [];
  if (!profile.isShippable) issues.push("Mark this product as eligible for shipping.");

  for (const [field, label] of packageFields) {
    const value = profile[field].trim();
    if (!value) {
      issues.push(`Enter the ${label}.`);
      continue;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      issues.push(`The ${label} must be greater than zero.`);
    }
  }

  return issues;
}

export function cloneProductShippingProfile(profile: ProductShippingProfile): ProductShippingProfile {
  return { ...profile };
}

export function productShippingProfilesMatch(left: ProductShippingProfile, right: ProductShippingProfile) {
  return JSON.stringify(left) === JSON.stringify(right);
}
