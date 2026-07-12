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
    description: "Choose colors, bouquet size, weights, and extras for your celebration.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Inventory-tracked colors and sizes should be Square item variations."
  },
  {
    slug: "mylar",
    title: "Mylar Balloons",
    sectionId: "balloons.type-selector",
    description: "Browse occasion balloons, characters, messages, and finishing touches.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Stocked mylar designs should be Square item variations, not modifiers."
  },
  {
    slug: "numbers-letters",
    title: "Numbers & Letters",
    sectionId: "balloons.type-selector",
    description: "Choose numbers or letters, colors, and the date you need them.",
    fulfillmentModes: ["pickup", "local-delivery"],
    squareModelingNote: "Each stocked number, letter, size, and color should map to an inventory-tracked variation."
  },
  {
    slug: "bouquets",
    title: "Bouquets",
    sectionId: "balloons.builder",
    description: "Explore ready-made balloon combinations for birthdays and special moments.",
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

export const balloonBuilderStepLabels: Record<(typeof balloonBuilderSteps)[number], string> = {
  "occasion-selector": "Occasion",
  "type-selector": "Balloon type",
  "color-selector": "Colors",
  "addons-selector": "Extras",
  "fulfillment-selector": "Pickup or delivery",
  "time-slot-picker": "Preferred date and time"
};
