export type BalloonFlowConfig = {
  slug: string;
  title: string;
  sectionId: string;
  description: string;
  fulfillmentModes: Array<"pickup" | "local-delivery">;
  squareModelingNote: string;
};

export const balloonFlows: BalloonFlowConfig[] = [
  {
    slug: "latex",
    title: "Latex Balloons",
    sectionId: "balloons.type-selector",
    description: "Build latex colors, bouquet size, event timing, weights, and add-ons.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Inventory-tracked colors and sizes should be Square item variations."
  },
  {
    slug: "mylar",
    title: "Mylar Balloons",
    sectionId: "balloons.type-selector",
    description: "Browse occasion mylar balloons, characters, messages, and presentation add-ons.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Stocked mylar designs should be Square item variations, not modifiers."
  },
  {
    slug: "numbers-letters",
    title: "Numbers & Letters",
    sectionId: "balloons.type-selector",
    description: "Choose digits, letters, phrase components, colors, and timing.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Each stocked number, letter, size, and color should map to an inventory-tracked variation."
  },
  {
    slug: "bouquets",
    title: "Bouquets",
    sectionId: "balloons.builder",
    description: "Compose premium bouquet templates from tracked components and non-stocked presentation modifiers.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Bouquets should be built from component variations plus safe presentation modifiers."
  }
];

export const balloonBuilderSteps = [
  "occasion-selector",
  "type-selector",
  "color-selector",
  "addons-selector",
  "fulfillment-selector",
  "time-slot-picker"
] as const;
