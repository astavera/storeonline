export type HomepageSectionType =
  | "hero"
  | "departments"
  | "product-grid"
  | "promo"
  | "storefront"
  | "content"
  | "image-banner"
  | "feature-grid"
  | "split-media"
  | "trust-bar"
  | "newsletter"
  | "faq";

export const homepageItemLinkTypes = ["manual", "page", "brand", "category", "product"] as const;
export type HomepageItemLinkType = (typeof homepageItemLinkTypes)[number];
export const homepageItemTones = ["yellow", "cyan", "green", "red", "white"] as const;
export type HomepageItemTone = (typeof homepageItemTones)[number];
export const homepageHeroSizes = ["compact", "standard", "large", "fullscreen"] as const;
export type HomepageHeroSize = (typeof homepageHeroSizes)[number];
export const homepageItemPresentations = ["card", "cutout"] as const;
export type HomepageItemPresentation = (typeof homepageItemPresentations)[number];

export type HomepageItemLinkOption = {
  type: Exclude<HomepageItemLinkType, "manual">;
  value: string;
  label: string;
  href: string;
  title: string;
  body?: string;
  image?: string;
  imageAlt?: string;
  productSlug?: string;
  squareVariationId?: string;
};

export type HomepageSectionItem = {
  id: string;
  label?: string;
  title: string;
  body?: string;
  href?: string;
  image?: string;
  imageAlt?: string;
  badge?: string;
  linkType?: HomepageItemLinkType;
  linkValue?: string;
  tone?: HomepageItemTone;
  presentation?: HomepageItemPresentation;
  productSlug?: string;
  squareVariationId?: string;
};

export const homepageSectionElements = ["eyebrow", "title", "body", "primaryCta", "secondaryCta", "items"] as const;

export type HomepageSectionElement = (typeof homepageSectionElements)[number];

export type HomepageSectionConfig = {
  sectionId: string;
  sectionType?: HomepageSectionType;
  title: string;
  eyebrow?: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  variant: string;
  sortOrder: number;
  isVisible: boolean;
  backgroundImage?: string;
  imageAlt?: string;
  mediaImage?: string;
  textPosition?: "left" | "center" | "right";
  mediaPlacement?: "background" | "left" | "right" | "none";
  placeholderLayout?: "grid" | "split" | "rail" | "stack";
  backgroundTone?: "default" | "muted" | "brand" | "dark" | "accent";
  contentWidth?: "narrow" | "normal" | "wide";
  verticalPadding?: "compact" | "normal" | "spacious";
  columns?: 2 | 3 | 4;
  heroSize?: HomepageHeroSize;
  hiddenElements?: HomepageSectionElement[];
  items?: HomepageSectionItem[];
};

export type HomepageImagePreset = {
  id: string;
  label: string;
  url: string;
};

export type HomepageSectionTemplate = {
  id: string;
  title: string;
  description: string;
  sectionType: HomepageSectionType;
  defaults: Omit<HomepageSectionConfig, "sectionId" | "sortOrder" | "isVisible">;
};

export const defaultHomepageImage = "https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=1800&q=80";
export const backToSchoolHomepageImage = "/images/home-hero-back-to-school.svg";
export const halloweenHomepageImage = "/images/seasonal/halloween-pumpkins-hero-hd.webp";

export const homepageImagePresets: HomepageImagePreset[] = [
  {
    id: "storefront",
    label: "Storefront",
    url: defaultHomepageImage
  },
  {
    id: "party",
    label: "Party",
    url: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1800&q=80"
  },
  {
    id: "toys",
    label: "Toys",
    url: "https://images.unsplash.com/photo-1560961911-ba7ef651a56c?auto=format&fit=crop&w=1800&q=80"
  },
  {
    id: "stationery",
    label: "Stationery",
    url: backToSchoolHomepageImage
  },
  {
    id: "back-to-school",
    label: "Back to School",
    url: backToSchoolHomepageImage
  },
  {
    id: "halloween",
    label: "Halloween",
    url: halloweenHomepageImage
  }
];

export const homepageSections: HomepageSectionConfig[] = [
  {
    sectionId: "home.hero",
    sectionType: "hero",
    eyebrow: "Halloween 2026",
    title: "Halloween starts here.",
    body: "Costumes, decorations, balloons, party supplies, and last-minute Halloween finds from your neighborhood store.",
    ctaLabel: "Shop Halloween",
    ctaHref: "/holidays/halloween",
    secondaryCtaLabel: "Browse party supplies",
    secondaryCtaHref: "/party-supplies",
    variant: "seasonal-card",
    sortOrder: 10,
    isVisible: true,
    backgroundImage: halloweenHomepageImage,
    imageAlt: "Glowing carved pumpkins arranged for Halloween",
    textPosition: "left",
    mediaPlacement: "background",
    placeholderLayout: "split",
    backgroundTone: "dark",
    contentWidth: "wide",
    verticalPadding: "normal",
    heroSize: "compact",
    hiddenElements: ["secondaryCta"],
    items: [
      { id: "halloween", title: "Halloween", href: "/holidays/halloween", linkType: "page", linkValue: "halloween", tone: "yellow" },
      { id: "party", title: "Party supplies", href: "/party-supplies", linkType: "page", linkValue: "party-supplies", tone: "cyan" },
      { id: "balloons", title: "Balloons", href: "/balloons", linkType: "page", linkValue: "balloons", tone: "green" }
    ]
  },
  {
    sectionId: "home.departments",
    sectionType: "departments",
    title: "Shop by category",
    body: "Explore toys, party supplies, balloons, arts and crafts, stationery, and gifts from your neighborhood store.",
    variant: "department-grid",
    sortOrder: 20,
    isVisible: true,
    placeholderLayout: "grid",
    backgroundTone: "default",
    contentWidth: "wide",
    verticalPadding: "normal",
    columns: 4,
    items: [
      { id: "toys", title: "Toys", href: "/products/premium-building-set", image: "/images/category-toys.svg", imageAlt: "Toy blocks category artwork", productSlug: "premium-building-set", squareVariationId: "seed-toy-building-set" },
      { id: "party", title: "Party", href: "/products/celebration-tableware-kit", image: "/images/category-party.svg", imageAlt: "Party confetti category artwork", productSlug: "celebration-tableware-kit", squareVariationId: "seed-party-tableware-kit" },
      { id: "balloons", title: "Balloons", href: "/products/mylar-balloon-pick", image: "/images/category-balloons.svg", imageAlt: "Balloon category artwork", productSlug: "mylar-balloon-pick", squareVariationId: "seed-mylar-balloon-pick" },
      { id: "arts", title: "Arts & crafts", href: "/products/art-project-essentials", image: "/images/category-arts.svg", imageAlt: "Arts and crafts category artwork", productSlug: "art-project-essentials", squareVariationId: "seed-art-project-essentials" },
      { id: "stationery", title: "Stationery", href: "/products/stationery-gift-set", image: "/images/category-stationery.svg", imageAlt: "Stationery category artwork", productSlug: "stationery-gift-set", squareVariationId: "seed-stationery-gift-set" },
      { id: "gifts", title: "Gifts", href: "/products/gift-wrap-pack", image: "/images/category-gifts.svg", imageAlt: "Gift category artwork", productSlug: "gift-wrap-pack", squareVariationId: "seed-gift-wrap-pack" }
    ]
  },
  {
    sectionId: "home.featured-products",
    sectionType: "product-grid",
    title: "Shop popular picks",
    body: "Neighborhood favorites for school, celebrations, and everyday moments—ready for pickup, local delivery, or shipping.",
    ctaLabel: "Shop all products",
    ctaHref: "/shop",
    variant: "featured-products",
    sortOrder: 30,
    isVisible: true,
    placeholderLayout: "rail",
    backgroundTone: "default",
    contentWidth: "wide",
    verticalPadding: "normal",
    columns: 4
  },
  {
    sectionId: "home.balloon-promo",
    sectionType: "promo",
    title: "Plan your balloon order",
    body: "Choose latex, mylar, numbers, or a ready-made bouquet, then select pickup or local delivery.",
    ctaLabel: "Explore balloons",
    ctaHref: "/balloons",
    variant: "balloon-promo",
    sortOrder: 40,
    isVisible: true,
    mediaPlacement: "right",
    placeholderLayout: "grid",
    backgroundTone: "default",
    contentWidth: "wide",
    verticalPadding: "normal",
    columns: 4,
    items: [
      { id: "latex", title: "Latex", body: "Classic balloon colors for birthdays and events." },
      { id: "mylar", title: "Mylar", body: "Characters, messages, shapes, and seasonal designs." },
      { id: "numbers", title: "Numbers", body: "Milestone numbers and letter combinations." },
      { id: "bouquets", title: "Bouquets", body: "Ready-made or guided balloon bundles." }
    ]
  },
  {
    sectionId: "home.local-storefront",
    sectionType: "storefront",
    title: "Two Upper East Side stores",
    body: "Choose your closest Upper East Side store for convenient pickup and local delivery.",
    ctaLabel: "View locations",
    ctaHref: "/locations",
    variant: "local-storefront",
    sortOrder: 50,
    isVisible: true,
    placeholderLayout: "grid",
    backgroundTone: "muted",
    contentWidth: "wide",
    verticalPadding: "normal",
    columns: 2
  }
];

export const homepageSectionTemplates: HomepageSectionTemplate[] = [
  {
    id: "announcement-banner",
    title: "Announcement banner",
    description: "A campaign, sale, pickup note, or seasonal message.",
    sectionType: "image-banner",
    defaults: {
      sectionType: "image-banner",
      eyebrow: "Now in store",
      title: "Seasonal favorites are ready for pickup.",
      body: "Promote a current campaign with a bold image, focused copy, and one clear action.",
      ctaLabel: "Shop now",
      ctaHref: "/shop",
      variant: "image-banner",
      backgroundImage: defaultHomepageImage,
      imageAlt: "Modern State featured campaign",
      textPosition: "center",
      mediaPlacement: "background",
      placeholderLayout: "split",
      backgroundTone: "dark",
      contentWidth: "wide",
      verticalPadding: "spacious"
    }
  },
  {
    id: "feature-grid",
    title: "Feature grid",
    description: "Editable cards for services, benefits, departments, or collections.",
    sectionType: "feature-grid",
    defaults: {
      sectionType: "feature-grid",
      eyebrow: "Why shop with us",
      title: "Built for neighborhood shopping.",
      body: "Use this block to explain what makes the store useful online and in person.",
      variant: "feature-grid",
      mediaPlacement: "none",
      placeholderLayout: "grid",
      backgroundTone: "default",
      contentWidth: "wide",
      verticalPadding: "normal",
      columns: 3,
      items: [
        { id: "pickup", title: "Fast pickup", body: "Prepare local orders for easy in-store pickup." },
        { id: "delivery", title: "Local delivery", body: "Route eligible orders through controlled delivery zones." },
        { id: "gifting", title: "Gift-ready", body: "Highlight toys, cards, balloons, and party add-ons together." }
      ]
    }
  },
  {
    id: "split-media",
    title: "Split media",
    description: "Image plus copy for departments, events, or a store story.",
    sectionType: "split-media",
    defaults: {
      sectionType: "split-media",
      eyebrow: "In the neighborhood",
      title: "A physical store experience, online.",
      body: "Pair a strong image with copy, a CTA, and optional supporting bullets.",
      ctaLabel: "Visit us",
      ctaHref: "/locations",
      variant: "split-media",
      backgroundImage: defaultHomepageImage,
      imageAlt: "Modern State retail display",
      textPosition: "left",
      mediaPlacement: "left",
      placeholderLayout: "stack",
      backgroundTone: "muted",
      contentWidth: "wide",
      verticalPadding: "normal",
      items: [
        { id: "stocked", title: "Local inventory context", body: "Use copy to explain pickup, availability, or services." },
        { id: "assisted", title: "Staff-assisted shopping", body: "Add details shoppers should know before ordering." }
      ]
    }
  },
  {
    id: "trust-bar",
    title: "Trust bar",
    description: "Compact proof points for checkout confidence.",
    sectionType: "trust-bar",
    defaults: {
      sectionType: "trust-bar",
      title: "Shop with confidence",
      body: "Short operational promises shown as compact badges.",
      variant: "trust-bar",
      mediaPlacement: "none",
      placeholderLayout: "rail",
      backgroundTone: "brand",
      contentWidth: "wide",
      verticalPadding: "compact",
      columns: 4,
      items: [
        { id: "service", title: "Helpful local service" },
        { id: "pickup", title: "Store pickup" },
        { id: "delivery", title: "Local delivery rules" },
        { id: "support", title: "Neighborhood support" }
      ]
    }
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Editable questions for pickup, balloons, delivery, or returns.",
    sectionType: "faq",
    defaults: {
      sectionType: "faq",
      eyebrow: "Questions",
      title: "What shoppers should know.",
      body: "Answer the questions that prevent checkout hesitation.",
      variant: "faq",
      mediaPlacement: "none",
      placeholderLayout: "stack",
      backgroundTone: "default",
      contentWidth: "normal",
      verticalPadding: "normal",
      items: [
        { id: "pickup", title: "Can I pick up my order?", body: "Yes. Pickup availability depends on store hours and product eligibility." },
        { id: "balloons", title: "Can I order balloons online?", body: "Balloon availability, timing, and delivery are controlled by fulfillment rules." },
        { id: "delivery", title: "Do you deliver locally?", body: "Contact either store with your address and order details to ask about local delivery." }
      ]
    }
  },
  {
    id: "newsletter",
    title: "Newsletter CTA",
    description: "A reusable signup or campaign CTA block.",
    sectionType: "newsletter",
    defaults: {
      sectionType: "newsletter",
      eyebrow: "Stay connected",
      title: "Get seasonal picks and local store updates.",
      body: "Use this block for email signup copy, event notes, or a customer service CTA.",
      ctaLabel: "Contact the store",
      ctaHref: "/contact",
      variant: "newsletter",
      mediaPlacement: "none",
      placeholderLayout: "split",
      backgroundTone: "accent",
      contentWidth: "normal",
      verticalPadding: "normal"
    }
  },
  {
    id: "editorial-content",
    title: "Editorial content",
    description: "Flexible text section for story, SEO copy, or policy highlights.",
    sectionType: "content",
    defaults: {
      sectionType: "content",
      eyebrow: "Store note",
      title: "Share what makes Modern State special.",
      body: "Use this section for announcements, local SEO copy, buyer guidance, event messaging, or anything the storefront needs.",
      ctaLabel: "Learn more",
      ctaHref: "/about",
      variant: "content",
      mediaPlacement: "none",
      placeholderLayout: "stack",
      backgroundTone: "default",
      contentWidth: "narrow",
      verticalPadding: "normal"
    }
  }
];
