export type FulfillmentMode = "pickup" | "local-delivery" | "shipping";

export type StorefrontProduct = {
  id: string;
  squareVariationId: string;
  slug: string;
  name: string;
  department: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  badge?: string;
  fulfillmentModes: FulfillmentMode[];
  inventoryStatus: "in-stock" | "limited" | "special-order";
};

export const storefrontProducts: StorefrontProduct[] = [
  {
    id: "toy-building-set",
    squareVariationId: "seed-toy-building-set",
    slug: "premium-building-set",
    name: "Premium Building Set",
    department: "Toys",
    shortDescription: "A colorful building kit for creative play and gifting.",
    description: "A gift-ready building set with bright pieces, durable storage, and flexible play patterns for kids who like to build, sort, and rebuild.",
    imageUrl: "https://images.unsplash.com/photo-1560961911-ba7ef651a56c?auto=format&fit=crop&w=900&q=80",
    priceCents: 2499,
    badge: "Best seller",
    fulfillmentModes: ["pickup", "local-delivery", "shipping"],
    inventoryStatus: "in-stock"
  },
  {
    id: "party-tableware-kit",
    squareVariationId: "seed-party-tableware-kit",
    slug: "celebration-tableware-kit",
    name: "Celebration Tableware Kit",
    department: "Party",
    shortDescription: "Coordinated plates, napkins, cups, and table accents.",
    description: "A ready-to-go party table kit for birthdays, school events, office celebrations, and last-minute hosting.",
    imageUrl: "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=900&q=80",
    priceCents: 1899,
    badge: "Party ready",
    fulfillmentModes: ["pickup", "local-delivery", "shipping"],
    inventoryStatus: "in-stock"
  },
  {
    id: "mylar-balloon-pick",
    squareVariationId: "seed-mylar-balloon-pick",
    slug: "mylar-balloon-pick",
    name: "Mylar Balloon Pick",
    department: "Balloons",
    shortDescription: "A single inflated mylar balloon for pickup or local delivery.",
    description: "Choose a cheerful mylar balloon for birthdays, congratulations, get-well gifts, and everyday surprises. Inflated balloon orders are routed to pickup or local delivery.",
    imageUrl: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=900&q=80",
    priceCents: 799,
    badge: "Pickup",
    fulfillmentModes: ["pickup", "local-delivery"],
    inventoryStatus: "limited"
  },
  {
    id: "art-project-essentials",
    squareVariationId: "seed-art-project-essentials",
    slug: "art-project-essentials",
    name: "Art Project Essentials",
    department: "Arts",
    shortDescription: "Paints, brushes, paper, and project basics in one bundle.",
    description: "A practical arts-and-crafts bundle for weekend projects, school assignments, and creative afternoons at home.",
    imageUrl: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
    priceCents: 2199,
    badge: "Staff pick",
    fulfillmentModes: ["pickup", "local-delivery", "shipping"],
    inventoryStatus: "in-stock"
  },
  {
    id: "stationery-gift-set",
    squareVariationId: "seed-stationery-gift-set",
    slug: "stationery-gift-set",
    name: "Stationery Gift Set",
    department: "Stationery",
    shortDescription: "Notebooks, pens, cards, and desk-friendly essentials.",
    description: "A polished stationery set for thank-you notes, planning, journaling, and small gift moments.",
    imageUrl: "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=900&q=80",
    priceCents: 1699,
    badge: "Giftable",
    fulfillmentModes: ["pickup", "local-delivery", "shipping"],
    inventoryStatus: "in-stock"
  },
  {
    id: "gift-wrap-pack",
    squareVariationId: "seed-gift-wrap-pack",
    slug: "gift-wrap-pack",
    name: "Gift Wrap Pack",
    department: "Gifts",
    shortDescription: "Coordinated wrap, tissue, ribbon, and tags.",
    description: "A convenient gift wrap pack for birthdays, holidays, hosting gifts, and party favors.",
    imageUrl: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=900&q=80",
    priceCents: 1299,
    badge: "Local favorite",
    fulfillmentModes: ["pickup", "local-delivery", "shipping"],
    inventoryStatus: "in-stock"
  }
];

export function getVisibleProducts(limit = storefrontProducts.length) {
  return storefrontProducts.slice(0, limit);
}

export function getProductsByDepartment(departmentSlug: string, limit = storefrontProducts.length) {
  const normalizedDepartment = normalizeProductKey(departmentSlug);

  return storefrontProducts.filter((product) => normalizeProductKey(product.department) === normalizedDepartment).slice(0, limit);
}

export function getProductsBySlugs(slugs: string[]) {
  const productsBySlug = new Map(storefrontProducts.map((product) => [product.slug, product]));

  return slugs.map((slug) => productsBySlug.get(slug)).filter((product): product is StorefrontProduct => Boolean(product));
}

export function getProductBySlug(slug: string) {
  return storefrontProducts.find((product) => product.slug === slug) ?? null;
}

export function getProductByVariationId(squareVariationId: string) {
  return storefrontProducts.find((product) => product.squareVariationId === squareVariationId) ?? null;
}

export function fulfillmentModeLabel(mode: FulfillmentMode) {
  if (mode === "local-delivery") {
    return "Local delivery";
  }

  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function normalizeProductKey(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
