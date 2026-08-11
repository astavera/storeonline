/**
 * Provides shared section defaults types and utilities for the application.
 */

import { cmsScopes, type CmsKnownSectionType, type CmsScope, type SectionContent, type SectionDataSource, type SectionDesignSettings, type SectionLayoutSettings, type SectionMediaSettings, type SectionRegistryItem, type SectionSettingsSchema } from "./cms-types";
import { createSectionDataSource } from "./data-sources";
import { baseSectionSettingsSchema, commerceSectionSettingsSchema } from "./section-schemas";

type SectionDefinition = Omit<SectionRegistryItem, "defaultVisibility" | "settingsSchema"> & {
  settingsSchema?: SectionSettingsSchema;
};

const allScopes = [...cmsScopes];
const contentScopes: CmsScope[] = ["homepage", "department", "holiday", "location", "policy", "landing"];
const commerceScopes: CmsScope[] = ["homepage", "department", "holiday", "product", "landing"];
const productScopes: CmsScope[] = ["product", "homepage", "department", "holiday", "landing"];
const globalScopes: CmsScope[] = ["homepage", "department", "holiday", "product", "location", "policy", "landing", "global-header", "global-footer"];

export const defaultResponsiveVisibility = {
  desktop: true,
  tablet: true,
  mobile: true
};

export const defaultSectionDesign: SectionDesignSettings = {
  backgroundTone: "default",
  radius: "medium",
  shadow: "soft",
  buttonStyle: "solid"
};

export const defaultSectionLayout: SectionLayoutSettings = {
  alignment: "left",
  containerWidth: "wide",
  paddingTop: 56,
  paddingBottom: 56,
  columns: 3,
  imagePosition: "none",
  placeholderLayout: "grid"
};

export const defaultSectionMedia: SectionMediaSettings = {
  image: "",
  imageAlt: ""
};

export const safeRichTextWarning = "Custom HTML and code embeds are restricted to safe rich text by default. Scripts, iframes, and third-party embeds require a security review.";

function variants(ids: string[]) {
  return ids.map((id) => ({
    id,
    label: toTitle(id)
  }));
}

function contentFor(label: string, description: string): SectionContent {
  return {
    eyebrow: "",
    title: label,
    body: description,
    primaryCtaLabel: "",
    primaryCtaHref: "",
    items: []
  };
}

function def(input: {
  type: CmsKnownSectionType;
  label: string;
  description: string;
  category: SectionRegistryItem["category"];
  icon: string;
  component?: string;
  variants?: string[];
  compatibleScopes?: CmsScope[];
  supportsInlineEditing?: boolean;
  supportsDataSource?: boolean;
  supportsMedia?: boolean;
  supportsSeo?: boolean;
  defaultContent?: SectionContent;
  defaultDesign?: SectionDesignSettings;
  defaultLayout?: SectionLayoutSettings;
  defaultMedia?: SectionMediaSettings;
  defaultDataSource?: SectionDataSource;
  settingsSchema?: SectionSettingsSchema;
}): SectionDefinition {
  const supportsDataSource = input.supportsDataSource ?? false;
  const supportsMedia = input.supportsMedia ?? !["spacer", "divider", "navigationMenu", "sortDropdown", "filterSidebar"].includes(input.type);

  return {
    type: input.type,
    label: input.label,
    description: input.description,
    category: input.category,
    icon: input.icon,
    component: input.component ?? `${input.type}Section`,
    variants: variants(input.variants ?? ["standard"]),
    defaultContent: input.defaultContent ?? contentFor(input.label, input.description),
    defaultDesign: {
      ...defaultSectionDesign,
      ...input.defaultDesign
    },
    defaultLayout: {
      ...defaultSectionLayout,
      ...input.defaultLayout
    },
    defaultMedia: {
      ...defaultSectionMedia,
      ...input.defaultMedia
    },
    defaultDataSource: input.defaultDataSource ?? createSectionDataSource(supportsDataSource ? "productPlacement" : "manual"),
    compatibleScopes: input.compatibleScopes ?? contentScopes,
    supportsInlineEditing: input.supportsInlineEditing ?? true,
    supportsDataSource,
    supportsMedia,
    supportsSeo: input.supportsSeo,
    settingsSchema: input.settingsSchema
  };
}

export const sectionDefinitions: SectionDefinition[] = [
  def({
    type: "announcementBar",
    label: "Announcement bar",
    description: "A narrow campaign, sale, pickup or seasonal notice.",
    category: "Global",
    icon: "Megaphone",
    variants: ["simple", "promo", "countdown", "dismissible"],
    compatibleScopes: globalScopes,
    defaultLayout: { paddingTop: 10, paddingBottom: 10, columns: 1 }
  }),
  def({
    type: "header",
    label: "Header",
    description: "Global storefront header with ecommerce navigation.",
    category: "Global",
    icon: "PanelTop",
    variants: ["classic", "centeredLogo", "splitNav", "minimal", "ecommerce"],
    compatibleScopes: ["global-header", ...contentScopes, "product"],
    defaultLayout: { paddingTop: 16, paddingBottom: 16, columns: 1 }
  }),
  def({ type: "navigationMenu", label: "Navigation menu", description: "Editable primary or secondary navigation links.", category: "Navigation", icon: "Menu", variants: ["horizontal", "vertical", "drawer"], compatibleScopes: ["global-header", "global-footer", ...contentScopes] }),
  def({ type: "megaMenu", label: "Mega menu", description: "Large menu with columns, images, products or departments.", category: "Navigation", icon: "PanelTopOpen", variants: ["columns", "imageFeature", "productFeature", "departmentFeature"], compatibleScopes: ["global-header"] }),
  def({ type: "footer", label: "Footer", description: "Global footer with links, policies, trust copy and contact details.", category: "Global", icon: "PanelBottom", variants: ["simple", "columns", "newsletter", "editorial", "commerce"], compatibleScopes: ["global-footer", ...contentScopes, "product"] }),
  def({ type: "breadcrumbs", label: "Breadcrumbs", description: "Navigation trail for collections, products and content pages.", category: "Navigation", icon: "Route", variants: ["simple", "compact"], compatibleScopes: ["department", "holiday", "product", "location", "policy", "landing"], supportsInlineEditing: false }),
  def({ type: "layoutContainer", label: "Layout container", description: "Controlled container for grouping storefront sections.", category: "Global", icon: "Columns3", variants: ["wide", "narrow", "fullBleed"], compatibleScopes: allScopes }),
  def({ type: "mobileMenu", label: "Mobile menu", description: "Mobile navigation drawer content.", category: "Navigation", icon: "Smartphone", variants: ["drawer", "bottomSheet"], compatibleScopes: ["global-header"] }),
  def({ type: "floatingElements", label: "Floating elements", description: "Safe floating badges, help buttons, or promotional accents.", category: "Utility", icon: "MousePointer2", variants: ["badge", "help", "promo"], compatibleScopes: contentScopes }),
  def({ type: "hero", label: "Hero", description: "Primary page hero with media, message and CTA.", category: "Hero", icon: "Image", variants: ["centered", "splitMedia", "fullBleed", "videoBackground", "carousel"], compatibleScopes: contentScopes, supportsMedia: true, supportsSeo: true, defaultLayout: { columns: 2, imagePosition: "right", paddingTop: 96, paddingBottom: 96, placeholderLayout: "split" } }),
  def({ type: "heroCarousel", label: "Hero carousel", description: "Rotating hero slides for campaigns or seasonal moments.", category: "Hero", icon: "GalleryHorizontal", variants: ["slides", "fade", "editorial"], compatibleScopes: ["homepage", "landing"], supportsMedia: true }),
  def({ type: "featuredCategories", label: "Featured categories", description: "Editable category cards for departments or collections.", category: "Collection", icon: "LayoutGrid", variants: ["grid", "carousel", "circular", "editorial"], compatibleScopes: ["homepage", "department", "landing"], supportsDataSource: true }),
  def({ type: "featuredProducts", label: "Featured products", description: "Curated product shelf backed by placements or Square cache.", category: "Commerce", icon: "ShoppingBag", variants: ["grid", "carousel", "editorial"], compatibleScopes: commerceScopes, supportsDataSource: true, settingsSchema: commerceSectionSettingsSchema }),
  def({ type: "collectionShowcase", label: "Collection showcase", description: "A promoted collection with media, copy and product links.", category: "Collection", icon: "Images", variants: ["imageLeft", "imageRight", "editorial", "grid"], compatibleScopes: commerceScopes, supportsDataSource: true, supportsMedia: true }),
  def({ type: "promoBanner", label: "Promo banner", description: "Campaign banner for offers, coupons or seasonal messages.", category: "Commerce", icon: "BadgePercent", variants: ["simple", "split", "countdown", "coupon"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "brandStory", label: "Brand story", description: "Narrative section for the store, founder note or local context.", category: "Editorial", icon: "BookOpen", variants: ["imageText", "editorial", "timeline"], supportsMedia: true }),
  def({ type: "benefitsIcons", label: "Benefits icons", description: "Icon strip for pickup, delivery, payment or support promises.", category: "Trust", icon: "Sparkles", variants: ["threeColumn", "fourColumn", "strip"] }),
  def({ type: "testimonials", label: "Testimonials", description: "Customer quotes, staff notes or community proof.", category: "Trust", icon: "Quote", variants: ["cards", "carousel", "quoteWall"] }),
  def({ type: "beforeAfter", label: "Before and after", description: "Comparison block for displays, balloons or event setups.", category: "Media", icon: "PanelLeftRight", variants: ["slider", "sideBySide"], supportsMedia: true }),
  def({ type: "socialFeed", label: "Social feed", description: "Safe social content placeholder or manually curated posts.", category: "Media", icon: "AtSign", variants: ["manualGrid", "embedPlaceholder"], supportsMedia: true }),
  def({ type: "newsletter", label: "Newsletter", description: "Email signup or contact CTA block.", category: "Forms", icon: "Mail", variants: ["minimal", "imageSplit", "footerEmbedded", "popupSafe"], compatibleScopes: ["homepage", "landing", "global-footer", "department", "holiday"], supportsMedia: true }),
  def({ type: "faqPreview", label: "FAQ preview", description: "Short FAQ teaser linking to a longer policy or help page.", category: "Trust", icon: "CircleHelp", variants: ["cards", "accordionPreview"] }),
  def({ type: "blogPreview", label: "Blog preview", description: "Editorial preview cards for guides, campaigns or updates.", category: "Editorial", icon: "Newspaper", variants: ["cards", "editorial", "carousel"], supportsDataSource: true, defaultDataSource: createSectionDataSource("blogPosts") }),
  def({ type: "logoCloud", label: "Logo cloud", description: "Brand, press or partner logos.", category: "Trust", icon: "BadgeCheck", variants: ["simple", "bordered", "grayscale"], supportsMedia: true }),
  def({ type: "videoSection", label: "Video section", description: "Video embed, background or split-media block.", category: "Media", icon: "Video", variants: ["embed", "background", "split"], supportsMedia: true }),
  def({ type: "customHtml", label: "Safe rich text", description: safeRichTextWarning, category: "Utility", icon: "Code", variants: ["safeRichTextOnly", "embedWhitelistIfAlreadySupported"], supportsMedia: false }),
  def({ type: "spacer", label: "Spacer", description: "Controlled whitespace between sections.", category: "Utility", icon: "MoveVertical", variants: ["small", "medium", "large", "custom"], supportsInlineEditing: false, supportsMedia: false, defaultLayout: { paddingTop: 24, paddingBottom: 24, columns: 1 } }),
  def({ type: "divider", label: "Divider", description: "Visual break between content bands.", category: "Utility", icon: "Minus", variants: ["line", "wave", "shape", "whitespace"], supportsInlineEditing: false, supportsMedia: false, defaultLayout: { paddingTop: 16, paddingBottom: 16, columns: 1 } }),
  def({ type: "productGrid", label: "Product grid", description: "Product grid controlled by placements or catalog filters.", category: "Commerce", icon: "ShoppingBasket", variants: ["standard", "editorial", "compact", "cardHeavy"], compatibleScopes: commerceScopes, supportsDataSource: true, settingsSchema: commerceSectionSettingsSchema }),
  def({ type: "productCarousel", label: "Product carousel", description: "Horizontal product shelf for curated merchandising.", category: "Commerce", icon: "GalleryHorizontalEnd", variants: ["standard", "compact", "editorial"], compatibleScopes: commerceScopes, supportsDataSource: true, settingsSchema: commerceSectionSettingsSchema }),
  def({ type: "featuredCollection", label: "Featured collection", description: "Prominent collection block with editable merchandising.", category: "Collection", icon: "PackageOpen", variants: ["standard", "editorial", "split"], compatibleScopes: commerceScopes, supportsDataSource: true }),
  def({ type: "departmentShowcase", label: "Department showcase", description: "Department hero, tiles, SEO copy or product gateway.", category: "Collection", icon: "Store", variants: ["grid", "editorial", "tiles"], compatibleScopes: ["homepage", "department", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("department") }),
  def({ type: "holidayCollection", label: "Holiday collection", description: "Seasonal collection shelf or landing block.", category: "Seasonal", icon: "CalendarHeart", variants: ["grid", "editorial", "countdown"], compatibleScopes: ["homepage", "holiday", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("holiday") }),
  def({ type: "bestSellers", label: "Best sellers", description: "Best-selling product shelf from safe catalog or placement data.", category: "Commerce", icon: "TrendingUp", variants: ["grid", "carousel"], compatibleScopes: commerceScopes, supportsDataSource: true }),
  def({ type: "newArrivals", label: "New arrivals", description: "Recently added or curated new product shelf.", category: "Commerce", icon: "BadgePlus", variants: ["grid", "carousel"], compatibleScopes: commerceScopes, supportsDataSource: true, defaultDataSource: createSectionDataSource("latestProducts") }),
  def({ type: "recentlyViewed", label: "Recently viewed", description: "Recently viewed products, with safe empty-state behavior.", category: "Commerce", icon: "History", variants: ["carousel", "compact"], compatibleScopes: ["product", "cart", "landing"].filter((scope): scope is CmsScope => scope !== "cart"), supportsDataSource: true, defaultDataSource: createSectionDataSource("recentlyViewed") }),
  def({ type: "productBundle", label: "Product bundle", description: "Manual bundle or gift-set merchandising block.", category: "Commerce", icon: "Boxes", variants: ["bundle", "giftSet"], compatibleScopes: commerceScopes, supportsDataSource: true }),
  def({ type: "upsellStrip", label: "Upsell strip", description: "Compact cross-sell shelf for product or cart flows.", category: "Commerce", icon: "PlusCircle", variants: ["compact", "editorial"], compatibleScopes: ["product", "landing"], supportsDataSource: true }),
  def({ type: "cartUpsell", label: "Cart upsell", description: "Safe cart-related upsell block.", category: "Commerce", icon: "ShoppingCart", variants: ["compact", "drawer"], compatibleScopes: ["product", "landing"], supportsDataSource: true }),
  def({ type: "productCard", label: "Product card", description: "Editable wrapper around real product data.", category: "Product", icon: "Package", variants: ["standard", "compact", "editorial"], compatibleScopes: productScopes, supportsDataSource: true, settingsSchema: commerceSectionSettingsSchema }),
  def({ type: "productImageGallery", label: "Product image gallery", description: "Product image gallery layout and display controls.", category: "Product", icon: "Images", variants: ["carousel", "grid", "stack"], compatibleScopes: ["product"], supportsDataSource: true, supportsMedia: true }),
  def({ type: "productTitle", label: "Product title", description: "Editable product title display wrapper.", category: "Product", icon: "Type", variants: ["standard", "large"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "productPrice", label: "Product price", description: "Price display wrapper. Square remains source of truth.", category: "Product", icon: "BadgeDollarSign", variants: ["standard", "compact"], compatibleScopes: ["product"], supportsDataSource: true, supportsInlineEditing: false }),
  def({ type: "productBadges", label: "Product badges", description: "Local website badges and labels around real products.", category: "Product", icon: "Badge", variants: ["inline", "stacked"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "variantSelector", label: "Variant selector", description: "Variation selector UI controlled by Square product data.", category: "Product", icon: "ListChecks", variants: ["buttons", "dropdown"], compatibleScopes: ["product"], supportsDataSource: true, supportsInlineEditing: false }),
  def({ type: "quantitySelector", label: "Quantity selector", description: "Quantity selection wrapper for product detail pages.", category: "Product", icon: "PlusMinus", variants: ["stepper", "dropdown"], compatibleScopes: ["product"], supportsDataSource: true, supportsInlineEditing: false }),
  def({ type: "addToCartButton", label: "Add to cart button", description: "Add-to-cart UI wrapper. Server validation remains authoritative.", category: "Product", icon: "ShoppingCart", variants: ["solid", "sticky", "wide"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "buyNowButton", label: "Buy now button", description: "Buy-now UI wrapper behind server-side checkout validation.", category: "Product", icon: "Zap", variants: ["solid", "outline"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "productDescription", label: "Product description", description: "Product description and local override display.", category: "Product", icon: "FileText", variants: ["standard", "accordion", "tabs"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "productSpecs", label: "Product specs", description: "Product specs and metadata display.", category: "Product", icon: "ClipboardList", variants: ["table", "list"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "shippingInfo", label: "Shipping info", description: "Shipping or delivery information copy.", category: "Product", icon: "Truck", variants: ["accordion", "card"], compatibleScopes: ["product", "policy"] }),
  def({ type: "returnsInfo", label: "Returns info", description: "Return policy highlight for product or policy pages.", category: "Product", icon: "Undo2", variants: ["accordion", "card"], compatibleScopes: ["product", "policy"] }),
  def({ type: "productReviews", label: "Product reviews", description: "Reviews placeholder or safe review feed wrapper.", category: "Product", icon: "Star", variants: ["summary", "list"], compatibleScopes: ["product"], supportsDataSource: true }),
  def({ type: "relatedProducts", label: "Related products", description: "Related product shelf controlled by placement or catalog rules.", category: "Product", icon: "Link", variants: ["carousel", "grid"], compatibleScopes: ["product"], supportsDataSource: true, defaultDataSource: createSectionDataSource("relatedProducts") }),
  def({ type: "stockIndicator", label: "Stock indicator", description: "Inventory display wrapper. Inventory remains Square-backed.", category: "Product", icon: "Activity", variants: ["badge", "inline"], compatibleScopes: ["product"], supportsDataSource: true, supportsInlineEditing: false }),
  def({ type: "sizeGuide", label: "Size guide", description: "Editable size guide or product-fit content.", category: "Product", icon: "Ruler", variants: ["modal", "inline"], compatibleScopes: ["product"], supportsMedia: true }),
  def({ type: "trustBadges", label: "Trust badges", description: "Checkout, payment, pickup or local delivery confidence badges.", category: "Trust", icon: "ShieldCheck", variants: ["strip", "grid", "compact"], compatibleScopes: globalScopes }),
  def({ type: "deliveryZoneChecker", label: "Delivery zone checker", description: "ZIP or address based eligibility checker foundation.", category: "Local SEO", icon: "MapPinCheck", variants: ["zipCode", "address", "mapAssisted"], compatibleScopes: ["homepage", "location", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("locationData") }),
  def({ type: "storeLocationCard", label: "Store location card", description: "Editable location card backed by store location data.", category: "Local SEO", icon: "MapPinned", variants: ["card", "compact", "hours"], compatibleScopes: ["homepage", "location", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("locationData") }),
  def({ type: "locationHero", label: "Location hero", description: "Location landing hero with local SEO copy.", category: "Local SEO", icon: "Map", variants: ["editorial", "mapSplit"], compatibleScopes: ["location"], supportsMedia: true, supportsSeo: true }),
  def({ type: "localSeoContentBlock", label: "Local SEO content", description: "Editable local SEO copy block.", category: "Local SEO", icon: "MapPin", variants: ["editorial", "faq", "serviceArea"], compatibleScopes: ["department", "holiday", "location", "landing"], supportsSeo: true }),
  def({ type: "sameDayDeliveryBanner", label: "Same-day delivery banner", description: "Local delivery promise and cutoff messaging.", category: "Local SEO", icon: "Timer", variants: ["banner", "strip"], compatibleScopes: ["homepage", "department", "holiday", "location", "landing"] }),
  def({ type: "pickupDeliveryInfo", label: "Pickup and delivery info", description: "Operational pickup and delivery copy.", category: "Local SEO", icon: "Truck", variants: ["cards", "strip", "accordion"], compatibleScopes: ["homepage", "product", "location", "policy"] }),
  def({ type: "serviceAreaGrid", label: "Service area grid", description: "Editable neighborhoods or service areas.", category: "Local SEO", icon: "MapPinned", variants: ["grid", "list"], compatibleScopes: ["location", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("locationData") }),
  def({ type: "mapboxDeliveryMap", label: "Mapbox delivery map", description: "Delivery zone map view with safe read-only fallback.", category: "Local SEO", icon: "Map", variants: ["preview", "editableZones", "readOnlyZones"], compatibleScopes: ["location", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("locationData") }),
  def({ type: "holidayHero", label: "Holiday hero", description: "Seasonal hero with campaign copy and media.", category: "Seasonal", icon: "Gift", variants: ["editorial", "countdown", "productFocused"], compatibleScopes: ["holiday", "homepage", "landing"], supportsMedia: true, supportsSeo: true }),
  def({ type: "countdownPromo", label: "Countdown promo", description: "Countdown campaign block for holidays or limited offers.", category: "Seasonal", icon: "Clock", variants: ["banner", "card", "hero"], compatibleScopes: ["holiday", "homepage", "landing"] }),
  def({ type: "giftGuideGrid", label: "Gift guide grid", description: "Gift guide cards by occasion, recipient or price.", category: "Seasonal", icon: "Gift", variants: ["occasionCards", "priceRangeCards", "recipientCards"], compatibleScopes: ["holiday", "homepage", "landing"], supportsDataSource: true }),
  def({ type: "occasionCards", label: "Occasion cards", description: "Occasion-based shopping cards.", category: "Seasonal", icon: "PartyPopper", variants: ["grid", "carousel"], compatibleScopes: ["holiday", "homepage", "landing"], supportsDataSource: true }),
  def({ type: "seasonalCollection", label: "Seasonal collection", description: "Seasonal product collection shelf.", category: "Seasonal", icon: "Snowflake", variants: ["grid", "carousel", "editorial"], compatibleScopes: ["holiday", "homepage", "landing"], supportsDataSource: true, defaultDataSource: createSectionDataSource("holiday") }),
  def({ type: "limitedAvailabilityBanner", label: "Limited availability banner", description: "Urgency banner for seasonal quantities or deadlines.", category: "Seasonal", icon: "BadgeAlert", variants: ["strip", "banner"], compatibleScopes: ["holiday", "homepage", "landing"] }),
  def({ type: "preorderCta", label: "Preorder CTA", description: "Preorder call-to-action for holiday or limited campaigns.", category: "Seasonal", icon: "CalendarPlus", variants: ["banner", "card"], compatibleScopes: ["holiday", "landing"] }),
  def({ type: "reviews", label: "Reviews", description: "Store or product review section.", category: "Trust", icon: "Stars", variants: ["cards", "summary", "wall"], compatibleScopes: contentScopes }),
  def({ type: "trustBar", label: "Trust bar", description: "Compact trust promises and checkout reassurance.", category: "Trust", icon: "ShieldCheck", variants: ["strip", "badges", "icons"], compatibleScopes: globalScopes }),
  def({ type: "faq", label: "FAQ", description: "Editable FAQ section.", category: "Trust", icon: "CircleHelp", variants: ["accordion", "categorized", "twoColumn"], compatibleScopes: contentScopes }),
  def({ type: "returnPolicyHighlight", label: "Return policy highlight", description: "Short return policy reassurance block.", category: "Trust", icon: "RotateCcw", variants: ["card", "strip"], compatibleScopes: ["product", "policy", "landing"] }),
  def({ type: "secureCheckoutBadges", label: "Secure checkout badges", description: "Checkout trust badges without exposing payment internals.", category: "Trust", icon: "LockKeyhole", variants: ["strip", "compact"], compatibleScopes: globalScopes }),
  def({ type: "squarePaymentTrust", label: "Square payment trust", description: "Square payment trust message. No secrets are exposed.", category: "Trust", icon: "CreditCard", variants: ["badge", "strip"], compatibleScopes: globalScopes }),
  def({ type: "shippingDeliveryPromise", label: "Shipping and delivery promise", description: "Fulfillment promise copy for delivery, pickup or shipping.", category: "Trust", icon: "Truck", variants: ["strip", "cards"], compatibleScopes: globalScopes }),
  def({ type: "editorialStory", label: "Editorial story", description: "Long-form brand, category or campaign story.", category: "Editorial", icon: "BookText", variants: ["story", "imageText", "timeline"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "imageWithText", label: "Image with text", description: "Flexible image plus copy block.", category: "Editorial", icon: "Image", variants: ["imageLeft", "imageRight", "stacked"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "splitMedia", label: "Split media", description: "Two-column media and content block.", category: "Editorial", icon: "Columns2", variants: ["imageLeft", "imageRight", "editorial"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "lookbookGrid", label: "Lookbook grid", description: "Editorial media grid for campaigns, gifts or displays.", category: "Editorial", icon: "Grid3X3", variants: ["grid", "masonry", "editorial"], compatibleScopes: ["homepage", "holiday", "landing"], supportsMedia: true }),
  def({ type: "founderNote", label: "Founder note", description: "Personal note from ownership or staff.", category: "Editorial", icon: "PenLine", variants: ["note", "portrait"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "pressMentions", label: "Press mentions", description: "Press or community mentions.", category: "Trust", icon: "Newspaper", variants: ["cards", "logoCloud"], compatibleScopes: contentScopes }),
  def({ type: "newsletterCta", label: "Newsletter CTA", description: "Newsletter or contact CTA block.", category: "Forms", icon: "MailPlus", variants: ["simple", "split", "footer"], compatibleScopes: ["homepage", "landing", "global-footer", "department", "holiday"] }),
  def({ type: "searchOverlay", label: "Search overlay", description: "Search overlay layout settings.", category: "Utility", icon: "Search", variants: ["overlay", "drawer"], compatibleScopes: ["global-header", "homepage", "department"], supportsDataSource: true }),
  def({ type: "filterSidebar", label: "Filter sidebar", description: "Filter sidebar UI for collection pages.", category: "Utility", icon: "SlidersHorizontal", variants: ["sidebar", "drawer"], compatibleScopes: ["department", "holiday", "landing"], supportsDataSource: true, supportsInlineEditing: false }),
  def({ type: "sortDropdown", label: "Sort dropdown", description: "Sort control for product listings.", category: "Utility", icon: "ArrowUpDown", variants: ["dropdown", "segmented"], compatibleScopes: ["department", "holiday", "landing"], supportsDataSource: true, supportsInlineEditing: false }),
  def({ type: "emptyState", label: "Empty state", description: "Editable fallback for empty product or content lists.", category: "Utility", icon: "Inbox", variants: ["simple", "illustrated", "cta"], compatibleScopes: allScopes }),
  def({ type: "modalPopup", label: "Modal popup", description: "Safe modal for newsletter or campaign CTAs.", category: "Utility", icon: "PanelTopOpen", variants: ["newsletter", "campaign", "ageGateSafe"], compatibleScopes: ["homepage", "landing"] }),
  def({ type: "cookieBanner", label: "Cookie banner", description: "Cookie notice placeholder and settings foundation.", category: "Utility", icon: "Cookie", variants: ["banner", "modal"], compatibleScopes: ["homepage", "landing", "policy"] }),
  def({ type: "customCodeEmbed", label: "Custom code embed", description: safeRichTextWarning, category: "Utility", icon: "Code2", variants: ["safeRichTextOnly"], compatibleScopes: ["landing", "policy"], supportsMedia: false, supportsInlineEditing: false }),
  def({ type: "departments", label: "Departments grid", description: "Legacy homepage departments grid adapter.", category: "Collection", icon: "LayoutGrid", variants: ["department-grid"], compatibleScopes: ["homepage"], supportsDataSource: true, defaultDataSource: createSectionDataSource("department") }),
  def({ type: "product-grid", label: "Product grid", description: "Legacy homepage product grid adapter.", category: "Commerce", icon: "ShoppingBasket", variants: ["featured-products"], compatibleScopes: ["homepage"], supportsDataSource: true, settingsSchema: commerceSectionSettingsSchema }),
  def({ type: "promo", label: "Promo", description: "Legacy promo section adapter.", category: "Commerce", icon: "BadgePercent", variants: ["balloon-promo"], compatibleScopes: ["homepage"], supportsMedia: true }),
  def({ type: "storefront", label: "Storefront", description: "Legacy local storefront adapter.", category: "Local SEO", icon: "Store", variants: ["local-storefront"], compatibleScopes: ["homepage"], supportsDataSource: true, defaultDataSource: createSectionDataSource("locationData") }),
  def({ type: "content", label: "Content", description: "Legacy editable content adapter.", category: "Editorial", icon: "FileText", variants: ["content"], compatibleScopes: contentScopes }),
  def({ type: "image-banner", label: "Image banner", description: "Legacy image banner adapter.", category: "Hero", icon: "Image", variants: ["image-banner"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "feature-grid", label: "Feature grid", description: "Legacy editable feature grid adapter.", category: "Editorial", icon: "Grid3X3", variants: ["feature-grid"], compatibleScopes: contentScopes }),
  def({ type: "split-media", label: "Split media", description: "Legacy split-media adapter.", category: "Editorial", icon: "Columns2", variants: ["split-media"], compatibleScopes: contentScopes, supportsMedia: true }),
  def({ type: "trust-bar", label: "Trust bar", description: "Legacy trust-bar adapter.", category: "Trust", icon: "ShieldCheck", variants: ["trust-bar"], compatibleScopes: globalScopes })
];

export const sectionDefaultMap = new Map(sectionDefinitions.map((definition) => [definition.type, definition]));

export function createDefaultSectionContent(type: CmsKnownSectionType): SectionContent {
  return { ...(sectionDefaultMap.get(type)?.defaultContent ?? contentFor(toTitle(type), "Editable storefront section.")) };
}

export function createDefaultSectionLayout(type: CmsKnownSectionType): SectionLayoutSettings {
  return { ...defaultSectionLayout, ...(sectionDefaultMap.get(type)?.defaultLayout ?? {}) };
}

export function createDefaultSectionDesign(type: CmsKnownSectionType): SectionDesignSettings {
  return { ...defaultSectionDesign, ...(sectionDefaultMap.get(type)?.defaultDesign ?? {}) };
}

export function createDefaultSectionMedia(type: CmsKnownSectionType): SectionMediaSettings {
  return { ...defaultSectionMedia, ...(sectionDefaultMap.get(type)?.defaultMedia ?? {}) };
}

function toTitle(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function settingsSchemaFor(type: CmsKnownSectionType): SectionSettingsSchema {
  return sectionDefaultMap.get(type)?.settingsSchema ?? baseSectionSettingsSchema;
}
