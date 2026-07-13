export type WebsitePlacementType =
  | "DEPARTMENT"
  | "HOLIDAY"
  | "BALLOON_SECTION"
  | "HOMEPAGE_SECTION"
  | "PRODUCT_GROUP"
  | "SEARCH_GROUP"
  | "PROMO_SECTION";

export type WebsiteProductPlacementInput = {
  squareVariationId: string;
  placementType: WebsitePlacementType;
  placementTargetSlug: string;
  sectionId: string;
  sortOrder?: number;
  isFeatured?: boolean;
  isPrimary?: boolean;
  visible?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type PlacementRuleInput = {
  name: string;
  matchField: "productName" | "squareCategory" | "sku" | "description";
  matchValue: string;
  placementType: WebsitePlacementType;
  placementTargetSlug: string;
  sectionId: string;
  suggestOnly: boolean;
  fulfillmentSuggestion?: {
    pickupAllowed?: boolean;
    localDeliveryAllowed?: boolean;
    shippingAllowed?: boolean;
    requiresBalloonPrep?: boolean;
  };
};

export type ProductPlacementSource = {
  productName: string;
  squareCategory?: string | null;
  sku?: string | null;
  description?: string | null;
};

export const defaultPlacementRules: PlacementRuleInput[] = [
  {
    name: "Balloon keyword",
    matchField: "productName",
    matchValue: "balloon",
    placementType: "DEPARTMENT",
    placementTargetSlug: "balloons",
    sectionId: "balloons.landing-hero",
    suggestOnly: true
  },
  {
    name: "Latex balloon keyword",
    matchField: "productName",
    matchValue: "latex",
    placementType: "BALLOON_SECTION",
    placementTargetSlug: "latex",
    sectionId: "balloons.type-selector",
    suggestOnly: true,
    fulfillmentSuggestion: {
      pickupAllowed: true,
      localDeliveryAllowed: true,
      shippingAllowed: false,
      requiresBalloonPrep: true
    }
  },
  {
    name: "Mylar balloon keyword",
    matchField: "productName",
    matchValue: "mylar",
    placementType: "BALLOON_SECTION",
    placementTargetSlug: "mylar",
    sectionId: "balloons.type-selector",
    suggestOnly: true,
    fulfillmentSuggestion: {
      pickupAllowed: true,
      localDeliveryAllowed: true,
      shippingAllowed: false,
      requiresBalloonPrep: true
    }
  },
  {
    name: "Graduation keyword",
    matchField: "productName",
    matchValue: "graduation",
    placementType: "HOLIDAY",
    placementTargetSlug: "graduation",
    sectionId: "holidays.detail-product-grid",
    suggestOnly: true
  },
  {
    name: "Square category Toys",
    matchField: "squareCategory",
    matchValue: "toys",
    placementType: "DEPARTMENT",
    placementTargetSlug: "toys",
    sectionId: "toys.product-grid",
    suggestOnly: true
  }
];

export function normalizePlacement(input: WebsiteProductPlacementInput): Required<Omit<WebsiteProductPlacementInput, "startsAt" | "endsAt">> & Pick<WebsiteProductPlacementInput, "startsAt" | "endsAt"> {
  return {
    squareVariationId: input.squareVariationId,
    placementType: input.placementType,
    placementTargetSlug: input.placementTargetSlug,
    sectionId: input.sectionId,
    sortOrder: input.sortOrder ?? 0,
    isFeatured: input.isFeatured ?? false,
    isPrimary: input.isPrimary ?? false,
    visible: input.visible ?? false,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null
  };
}

export function suggestPlacements(product: ProductPlacementSource, rules: PlacementRuleInput[] = defaultPlacementRules) {
  return rules.filter((rule) => {
    const sourceValue = product[rule.matchField] ?? "";
    return sourceValue.toLowerCase().includes(rule.matchValue.toLowerCase());
  });
}

export function productNeedsPlacement(placements: Array<{ visible: boolean }> = []) {
  return placements.filter((placement) => placement.visible).length === 0;
}

export function productNeedsReview({
  hasPlacement,
  hasDescription,
  hasImage,
  hasFulfillmentRules
}: {
  hasPlacement: boolean;
  hasDescription: boolean;
  hasImage: boolean;
  hasFulfillmentRules: boolean;
}) {
  return !hasPlacement || !hasDescription || !hasImage || !hasFulfillmentRules;
}
