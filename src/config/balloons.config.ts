/**
 * Defines the balloons configuration used by the application.
 */

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
  "fulfillment-selector": "Store pickup or local delivery",
  "time-slot-picker": "Preferred date and time"
};

// Approved Square variations for the first production Latex ordering collection.
// Product names, images, prices, and inventory continue to come from Square.
export const latexBalloonOrderVariationIds = [
  "7CBLTKU4S7X6WXTZBLPELXWH", // Key Lime
  "6U6P3H54SLBEGKHPOLIRNQ4C", // Fashion Blue
  "FJWQTYDZUFQZNSJIUKBHYDVX", // Bubble Gum Pink
  "3GQC5FW3SDOSYYAXPASY4KCD", // Fashion White
  "TVG764C7K4PL6WWL5BX2PVX6", // Metallic Fuchsia
  "QTFQTLAUBIWYZD7X6GBUMLEF", // Neon Blue
  "CCCR5DMRVYAKHP7LEQQK5XXS", // Neon Magenta
  "WFNPXTNRAO5ZMD7KJZV2O3JI", // Neon Orange
  "OIANS6DC4QL6SI3A6P2N33S5", // Pastel Matte Blue
  "VF4IY27F7SBOKWSKKF6DUPCA", // Pearl Blue
  "TX6SVL7QJCKLWEZYRBSCTTTP", // Pearl Pink
  "TAULX7KJ6ISSS2XBXTSS5DSB", // Pearl White
  "PNPQPY532CPGNL6FGLG46ZBV" // Reflex Silver
] as const;

export const latexBalloonAddOnVariationIds = {
  hiFloat: "45SAL5YW2MQTT6372PVZ3QYC",
  weights: [
    "TQ4R3CH3JKJJCIRWQEANPO2W", // Royal Blue
    "NVGHNXPCNWFRZFWRVRM6EKCI", // Black
    "KQONT2XJOMQQZSMQ5CUGY5IC", // Gold
    "53YHIOHJE45AKLHABJD75CY6", // Green
    "PUKHJDPXAAWLFW3HYMUPOQSI", // Light Pink
    "UXWLDYKRWZHE4GWFKLWYNSCS" // Holographic Gold
  ]
} as const;

export const balloonCatalogCollections = [
  {
    slug: "latex",
    title: "Latex Balloons",
    description: "Shop latex balloons for bouquets, parties, and colorful everyday celebrations.",
    keywords: ["latex"]
  },
  {
    slug: "mylar",
    title: "Mylar Balloons",
    description: "Shop foil and mylar balloons in shapes, characters, and occasion designs.",
    keywords: ["mylar", "foil"]
  },
  {
    slug: "bouquets",
    title: "Balloon Bouquets",
    description: "Shop balloon bouquets and ready-to-build arrangements.",
    keywords: ["bouquet", "arrangement"]
  },
  {
    slug: "personalized",
    title: "Personalized Balloons",
    description: "Shop custom balloons made for names, messages, and personal moments.",
    keywords: ["personalized", "personalised", "custom", "customized"]
  },
  {
    slug: "arches",
    title: "Balloon Arches",
    description: "Shop balloon arches, garlands, and columns for entrances, backdrops, and celebrations.",
    keywords: ["arch", "arches", "garland", "column"]
  },
  {
    slug: "numbers",
    title: "Number Balloons",
    description: "Shop number balloons for birthdays, anniversaries, and milestone celebrations.",
    keywords: ["number", "numeric", "digit"]
  },
  {
    slug: "letters",
    title: "Letter Balloons",
    description: "Shop letter and alphabet balloons for names, initials, and messages.",
    keywords: ["letter", "alphabet"]
  },
  {
    slug: "happy-birthday",
    title: "Happy Birthday Balloons",
    description: "Shop birthday balloons, messages, and celebration-ready designs.",
    keywords: ["happy birthday", "birthday"]
  },
  {
    slug: "any-occasion",
    title: "Any Occasion Balloons",
    description: "Shop balloons for birthdays, congratulations, new babies, get-well wishes, love, and everyday celebrations.",
    keywords: ["occasion", "birthday", "congratulations", "congrats", "graduation", "baby", "get well", "love"]
  }
] as const;

export type BalloonCatalogCollection = (typeof balloonCatalogCollections)[number];
export type BalloonCatalogCollectionSlug = BalloonCatalogCollection["slug"];

export function getBalloonCatalogCollection(slug: string | undefined) {
  return balloonCatalogCollections.find((collection) => collection.slug === slug);
}
