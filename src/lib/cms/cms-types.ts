export const cmsScopes = ["homepage", "department", "holiday", "product", "location", "policy", "landing", "global-header", "global-footer", "theme"] as const;

export type CmsScope = (typeof cmsScopes)[number];

export const cmsEntityTypes = ["homepage", "department", "holiday", "product", "location", "policy", "landing", "globalHeader", "globalFooter", "theme"] as const;

export type CmsEntityType = (typeof cmsEntityTypes)[number];

export const cmsVersionStatuses = ["DRAFT", "PREVIEW", "PUBLISHED", "SCHEDULED", "UNPUBLISHED", "ARCHIVED"] as const;

export type CmsVersionStatus = (typeof cmsVersionStatuses)[number];

export const cmsSectionCategories = ["Global", "Hero", "Commerce", "Product", "Collection", "Editorial", "Trust", "Navigation", "Forms", "Media", "Local SEO", "Seasonal", "Utility"] as const;

export type CmsSectionCategory = (typeof cmsSectionCategories)[number];

export const cmsDataSourceTypes = [
  "manual",
  "productCollection",
  "department",
  "holiday",
  "squareCatalog",
  "productPlacement",
  "relatedProducts",
  "latestProducts",
  "featuredProducts",
  "recentlyViewed",
  "locationData",
  "blogPosts",
  "policyContent",
  "custom"
] as const;

export type CmsDataSourceType = (typeof cmsDataSourceTypes)[number];

export const cmsKnownSectionTypes = [
  "announcementBar",
  "header",
  "navigationMenu",
  "megaMenu",
  "footer",
  "breadcrumbs",
  "layoutContainer",
  "mobileMenu",
  "floatingElements",
  "hero",
  "heroCarousel",
  "featuredCategories",
  "featuredProducts",
  "collectionShowcase",
  "promoBanner",
  "brandStory",
  "benefitsIcons",
  "testimonials",
  "beforeAfter",
  "socialFeed",
  "newsletter",
  "faqPreview",
  "blogPreview",
  "logoCloud",
  "videoSection",
  "customHtml",
  "spacer",
  "divider",
  "productGrid",
  "productCarousel",
  "featuredCollection",
  "departmentShowcase",
  "holidayCollection",
  "bestSellers",
  "newArrivals",
  "recentlyViewed",
  "productBundle",
  "upsellStrip",
  "cartUpsell",
  "productCard",
  "productImageGallery",
  "productTitle",
  "productPrice",
  "productBadges",
  "variantSelector",
  "quantitySelector",
  "addToCartButton",
  "buyNowButton",
  "productDescription",
  "productSpecs",
  "shippingInfo",
  "returnsInfo",
  "productReviews",
  "relatedProducts",
  "stockIndicator",
  "sizeGuide",
  "trustBadges",
  "deliveryZoneChecker",
  "storeLocationCard",
  "locationHero",
  "localSeoContentBlock",
  "sameDayDeliveryBanner",
  "pickupDeliveryInfo",
  "serviceAreaGrid",
  "mapboxDeliveryMap",
  "holidayHero",
  "countdownPromo",
  "giftGuideGrid",
  "occasionCards",
  "seasonalCollection",
  "limitedAvailabilityBanner",
  "preorderCta",
  "reviews",
  "trustBar",
  "faq",
  "returnPolicyHighlight",
  "secureCheckoutBadges",
  "squarePaymentTrust",
  "shippingDeliveryPromise",
  "editorialStory",
  "imageWithText",
  "splitMedia",
  "lookbookGrid",
  "founderNote",
  "pressMentions",
  "newsletterCta",
  "searchOverlay",
  "filterSidebar",
  "sortDropdown",
  "emptyState",
  "modalPopup",
  "cookieBanner",
  "customCodeEmbed",
  "departments",
  "product-grid",
  "promo",
  "storefront",
  "content",
  "image-banner",
  "feature-grid",
  "split-media",
  "trust-bar"
] as const;

export type CmsKnownSectionType = (typeof cmsKnownSectionTypes)[number];
export type CmsSectionType = CmsKnownSectionType | (string & {});
export type CmsSectionVariant = string;

export type SeoConfig = {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  indexable: boolean;
};

export type ThemeTokens = {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    muted: string;
    border: string;
    text: string;
    success: string;
    warning: string;
    danger: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    headingScale: "compact" | "standard" | "editorial" | "display";
    bodyScale: "compact" | "standard" | "comfortable";
    lineHeight: "tight" | "normal" | "relaxed";
    letterSpacing: "normal" | "wide";
    headingWeight: number;
    bodyWeight: number;
  };
  spacing: {
    sectionPadding: number;
    containerPadding: number;
    gridGap: number;
    cardPadding: number;
    buttonPaddingX: number;
    buttonPaddingY: number;
    mobileScale: number;
  };
  radius: "none" | "small" | "medium" | "large" | "pill";
  shadows: "none" | "soft" | "medium" | "strong";
  buttons: {
    style: "solid" | "outline" | "ghost" | "link";
    radius: "none" | "small" | "medium" | "large" | "pill";
    uppercase: boolean;
    iconPosition: "none" | "left" | "right";
    hover: "none" | "lift" | "fill" | "underline";
  };
  cards: {
    border: boolean;
    shadow: "none" | "soft" | "medium" | "strong";
    radius: "none" | "small" | "medium" | "large";
    imageRatio: "1:1" | "4:3" | "3:2" | "16:9";
    imageHover: "none" | "zoom" | "fade";
    contentAlignment: "left" | "center";
    badgePosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
  grid: {
    desktopColumns: number;
    tabletColumns: number;
    mobileColumns: number;
    gap: number;
    containerWidth: "narrow" | "normal" | "wide" | "full";
    mobileBehavior: "stack" | "scroll";
  };
  animation: "none" | "fade" | "slide" | "zoom" | "hoverLift";
  images: {
    aspectRatio: "auto" | "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
    objectFit: "cover" | "contain";
    radius: "none" | "small" | "medium" | "large";
    overlay: "none" | "light" | "dark" | "brand";
    opacity: number;
  };
};

export type ThemeTokenOverrides = {
  colors?: Partial<ThemeTokens["colors"]>;
  typography?: Partial<ThemeTokens["typography"]>;
  spacing?: Partial<ThemeTokens["spacing"]>;
  radius?: ThemeTokens["radius"];
  shadows?: ThemeTokens["shadows"];
  buttons?: Partial<ThemeTokens["buttons"]>;
  cards?: Partial<ThemeTokens["cards"]>;
  grid?: Partial<ThemeTokens["grid"]>;
  animation?: ThemeTokens["animation"];
  images?: Partial<ThemeTokens["images"]>;
};

export type ResponsiveVisibility = {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
};

export type SectionContentItem = {
  id: string;
  label?: string;
  title?: string;
  body?: string;
  href?: string;
  image?: string;
  imageAlt?: string;
  badge?: string;
  [key: string]: unknown;
};

export type SectionContent = {
  eyebrow?: string;
  title?: string;
  body?: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  items?: SectionContentItem[];
  [key: string]: unknown;
};

export type SectionDesignSettings = {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  backgroundTone?: "default" | "muted" | "brand" | "dark" | "accent";
  radius?: ThemeTokens["radius"];
  shadow?: ThemeTokens["shadows"];
  buttonStyle?: ThemeTokens["buttons"]["style"];
  cardStyle?: "plain" | "bordered" | "elevated" | "editorial";
  presetId?: string;
  [key: string]: unknown;
};

export type SectionLayoutSettings = {
  alignment?: "left" | "center" | "right";
  containerWidth?: ThemeTokens["grid"]["containerWidth"];
  paddingTop?: number;
  paddingBottom?: number;
  columns?: number;
  imagePosition?: "left" | "right" | "background" | "none";
  placeholderLayout?: "grid" | "split" | "rail" | "stack";
  [key: string]: unknown;
};

export type SectionMediaSettings = {
  image?: string;
  imageAlt?: string;
  mobileImage?: string;
  videoUrl?: string;
  focalPoint?: {
    x: number;
    y: number;
  };
  [key: string]: unknown;
};

export type SectionDataSource = {
  type: CmsDataSourceType;
  id?: string;
  query?: Record<string, unknown>;
  limit?: number;
  sort?: string;
  manualIds?: string[];
};

export type SectionAdvancedSettings = {
  anchorId?: string;
  customClassName?: string;
  analyticsName?: string;
  safeRichTextHtml?: string;
  notes?: string;
  [key: string]: unknown;
};

export type CmsSection = {
  id: string;
  type: CmsSectionType;
  variant: CmsSectionVariant;
  label: string;
  hidden: boolean;
  locked: boolean;
  content: SectionContent;
  design: SectionDesignSettings;
  layout: SectionLayoutSettings;
  media: SectionMediaSettings;
  dataSource: SectionDataSource;
  visibility: ResponsiveVisibility;
  advanced: SectionAdvancedSettings;
};

export type CmsSectionPatch = Omit<
  Partial<CmsSection>,
  "content" | "design" | "layout" | "media" | "dataSource" | "visibility" | "advanced"
> & {
  content?: Partial<SectionContent>;
  design?: Partial<SectionDesignSettings>;
  layout?: Partial<SectionLayoutSettings>;
  media?: Partial<SectionMediaSettings>;
  dataSource?: Partial<SectionDataSource>;
  visibility?: Partial<ResponsiveVisibility>;
  advanced?: Partial<SectionAdvancedSettings>;
};

export type CmsPageDocument = {
  id: string;
  entityType: CmsEntityType;
  entityId: string;
  title: string;
  slug: string;
  seo: SeoConfig;
  themeOverrides?: ThemeTokenOverrides;
  sections: CmsSection[];
  status: CmsVersionStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  version: number;
  createdBy?: string;
  updatedBy?: string;
};

export type SectionSettingsFieldType = "text" | "textarea" | "url" | "image" | "number" | "select" | "toggle" | "color" | "richText" | "dataSource";

export type SectionSettingsField = {
  key: string;
  label: string;
  type: SectionSettingsFieldType;
  required?: boolean;
  options?: string[];
  helpText?: string;
};

export type SectionSettingsSchema = {
  content?: SectionSettingsField[];
  design?: SectionSettingsField[];
  layout?: SectionSettingsField[];
  media?: SectionSettingsField[];
  dataSource?: SectionSettingsField[];
  visibility?: SectionSettingsField[];
  advanced?: SectionSettingsField[];
};

export type SectionRegistryItem = {
  type: CmsKnownSectionType;
  label: string;
  description: string;
  category: CmsSectionCategory;
  icon: string;
  component: string;
  variants: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  defaultContent: SectionContent;
  defaultDesign: SectionDesignSettings;
  defaultLayout: SectionLayoutSettings;
  defaultMedia: SectionMediaSettings;
  defaultDataSource: SectionDataSource;
  defaultVisibility: ResponsiveVisibility;
  settingsSchema: SectionSettingsSchema;
  compatibleScopes: CmsScope[];
  supportsInlineEditing: boolean;
  supportsDataSource: boolean;
  supportsMedia: boolean;
  supportsSeo?: boolean;
};

export type ThemePreset = {
  id: string;
  label: string;
  description: string;
  tokens: ThemeTokenOverrides;
};

export type SectionPreset = {
  id: string;
  label: string;
  description: string;
  sectionTypes: CmsKnownSectionType[];
  content?: SectionContent;
  design?: SectionDesignSettings;
  layout?: SectionLayoutSettings;
  media?: SectionMediaSettings;
};

export type LayoutPreset = {
  id: string;
  label: string;
  layout: SectionLayoutSettings;
};

export type CardPreset = {
  id: string;
  label: string;
  card: ThemeTokens["cards"];
};

export type ButtonPreset = {
  id: string;
  label: string;
  button: ThemeTokens["buttons"];
};
