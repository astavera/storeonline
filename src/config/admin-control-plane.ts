export type AdminFieldType = "text" | "textarea" | "select" | "boolean" | "number" | "url" | "datetime" | "list" | "json";

export type AdminFieldValue = string | number | boolean | string[];

export type AdminControlField = {
  name: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  helpText: string;
  defaultValue?: AdminFieldValue;
  options?: string[];
};

export type AdminWorkflowAction = "save_draft" | "preview" | "publish" | "schedule" | "unpublish";

export type AdminModule = {
  id: string;
  href: string;
  title: string;
  sectionId: string;
  category: "Storefront" | "Catalog" | "Merchandising" | "Operations" | "Settings" | "System";
  purpose: string;
  productionGoal: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  ownerRoles: string[];
  connectedModels: string[];
  editableFields: AdminControlField[];
  workflowActions: AdminWorkflowAction[];
  guardrails: string[];
  productionChecklist: string[];
};

const fullWorkflow: AdminWorkflowAction[] = ["save_draft", "preview", "publish", "schedule", "unpublish"];
const operationsWorkflow: AdminWorkflowAction[] = ["save_draft", "publish", "unpublish"];

const statusOptions = ["Draft", "Visible", "Hidden", "Scheduled", "Needs review"];
const fulfillmentOptions = ["Pickup", "Local delivery", "Shipping", "Pickup + local delivery", "Pickup + shipping", "All modes"];

const contentFields: AdminControlField[] = [
  { name: "title", label: "Title", type: "text", required: true, helpText: "Primary customer-facing heading or admin title.", defaultValue: "Modern State" },
  { name: "summary", label: "Summary", type: "textarea", required: true, helpText: "Short copy shown on the website or inside admin previews.", defaultValue: "Editable production content." },
  { name: "ctaLabel", label: "CTA label", type: "text", helpText: "Button label for this module.", defaultValue: "Shop now" },
  { name: "ctaHref", label: "CTA link", type: "url", helpText: "Internal route or full HTTPS URL.", defaultValue: "/shop" },
  { name: "status", label: "Visibility status", type: "select", required: true, helpText: "Drafts stay private until published.", defaultValue: "Draft", options: statusOptions }
];

const seoFields: AdminControlField[] = [
  { name: "seoTitle", label: "SEO title", type: "text", helpText: "Search title for this page or product.", defaultValue: "" },
  { name: "seoDescription", label: "SEO description", type: "textarea", helpText: "Search and social description.", defaultValue: "" },
  { name: "canonicalUrl", label: "Canonical URL", type: "url", helpText: "Canonical route or HTTPS URL.", defaultValue: "" },
  { name: "keywords", label: "Keywords", type: "list", helpText: "Comma-separated internal keywords.", defaultValue: [] }
];

const productFields: AdminControlField[] = [
  { name: "squareVariationId", label: "Square variation ID", type: "text", required: true, helpText: "Reference only. Prices and inventory remain Square-owned.", defaultValue: "SQ_VARIATION_ID" },
  { name: "webTitle", label: "Website title", type: "text", helpText: "Website-only product title override.", defaultValue: "" },
  { name: "webShortDescription", label: "Short description", type: "textarea", helpText: "Product card and quick-view copy.", defaultValue: "" },
  { name: "webVisible", label: "Visible online", type: "boolean", helpText: "Controls website visibility without changing Square.", defaultValue: false },
  { name: "badge", label: "Badge", type: "text", helpText: "Optional merchandising badge.", defaultValue: "" },
  { name: "fulfillmentMode", label: "Fulfillment mode", type: "select", helpText: "Website fulfillment eligibility.", defaultValue: "Pickup", options: fulfillmentOptions }
];

const scheduleFields: AdminControlField[] = [
  { name: "scheduledPublishAt", label: "Publish at", type: "datetime", helpText: "Optional scheduled publish timestamp.", defaultValue: "" },
  { name: "scheduledUnpublishAt", label: "Unpublish at", type: "datetime", helpText: "Optional scheduled unpublish timestamp.", defaultValue: "" }
];

export const adminModules: AdminModule[] = [
  {
    id: "admin-control-plane",
    href: "/admin",
    title: "Admin Control Plane",
    sectionId: "admin.control-plane",
    category: "System",
    purpose: "Single operating dashboard for storefront content, catalog merchandising, fulfillment, media, permissions, and release workflow.",
    productionGoal: "Give owners a Wix/Shopify-style command center while keeping payment, inventory, and security controls protected.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager"],
    connectedModels: ["CmsContentVersion", "AuditLog", "AdminUser"],
    editableFields: [
      { name: "announcement", label: "Admin announcement", type: "textarea", helpText: "Internal note shown to staff.", defaultValue: "Review drafts before publishing." },
      { name: "maintenanceMode", label: "Maintenance mode", type: "boolean", helpText: "When enabled, storefront publishing should pause.", defaultValue: false },
      { name: "releaseNote", label: "Release note", type: "textarea", helpText: "Reason for the next production publish.", defaultValue: "" }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Requires owner or manager role.", "All publishes must create an audit event.", "Sensitive checkout and Square secrets are not editable here."],
    productionChecklist: ["RBAC enabled", "Audit log connected", "Database-backed CMS versions", "Rollback tested"]
  },
  {
    id: "homepage",
    href: "/admin/homepage",
    title: "Editor",
    sectionId: "admin.homepage-sections",
    category: "Storefront",
    purpose: "Edit the storefront homepage, header navigation, and linked website pages from the central editor.",
    productionGoal: "Let staff update website content without deploying code.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Marketing"],
    connectedModels: ["CmsContentVersion", "WebsiteProductPlacement", "MediaAsset"],
    editableFields: [
      ...contentFields,
      { name: "sectionOrder", label: "Section order", type: "list", helpText: "Ordered section IDs for the homepage.", defaultValue: ["home.hero", "home.departments", "home.featured-products"] },
      { name: "visualSections", label: "Visual sections JSON", type: "json", helpText: "Full homepage visual editor state for sections, images, layout, visibility, and positions.", defaultValue: "[]" },
      { name: "photoPresets", label: "Photo presets JSON", type: "json", helpText: "Editable visual editor photo preset library.", defaultValue: "[]" },
      { name: "seoMetadata", label: "SEO metadata JSON", type: "json", helpText: "Homepage SEO title, description, Open Graph image, and canonical URL.", defaultValue: "{}" },
      { name: "changeSummary", label: "Change summary", type: "textarea", helpText: "Internal note saved with this homepage draft or publication.", defaultValue: "" },
      ...scheduleFields
    ],
    workflowActions: fullWorkflow,
    guardrails: ["No arbitrary CSS.", "Featured products must reference website placements.", "Homepage can be previewed before publish."],
    productionChecklist: ["Hero copy complete", "CTA links valid", "All referenced media has alt text", "Preview approved"]
  },
  {
    id: "navigation",
    href: "/admin/navigation",
    title: "Navigation",
    sectionId: "admin.navigation",
    category: "Storefront",
    purpose: "Manage header, footer, department, utility, and campaign navigation labels, order, visibility, and links.",
    productionGoal: "Change navigation safely without changing Square categories or route code.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Marketing"],
    connectedModels: ["CmsContentVersion", "AuditLog"],
    editableFields: [
      { name: "label", label: "Label", type: "text", required: true, helpText: "Visible navigation label.", defaultValue: "Holidays" },
      { name: "href", label: "Link", type: "url", required: true, helpText: "Internal route or HTTPS URL.", defaultValue: "/holidays" },
      { name: "placement", label: "Placement", type: "select", required: true, helpText: "Navigation area.", defaultValue: "Header", options: ["Header", "Footer", "Utility", "Campaign"] },
      { name: "sortOrder", label: "Sort order", type: "number", helpText: "Lower numbers appear first.", defaultValue: 10 },
      { name: "visible", label: "Visible", type: "boolean", helpText: "Show this link on the storefront.", defaultValue: true }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["External URLs must be HTTPS.", "Hidden links stay available for rollback.", "Route deletion is not allowed from this screen."],
    productionChecklist: ["Links verified", "Mobile header checked", "Footer checked", "Rollback version available"]
  },
  {
    id: "departments",
    href: "/admin/departments",
    title: "Departments",
    sectionId: "admin.departments",
    category: "Storefront",
    purpose: "Edit website departments, landing page copy, SEO, accents, visibility, and product merchandising independent from Square reporting.",
    productionGoal: "Give staff control over online departments while Square remains the reporting source.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Marketing"],
    connectedModels: ["Department", "CmsContentVersion", "WebsiteProductPlacement"],
    editableFields: [
      { name: "departmentSlug", label: "Department slug", type: "text", required: true, helpText: "Website department identifier.", defaultValue: "toys" },
      ...contentFields,
      ...seoFields,
      { name: "accentColor", label: "Accent color token", type: "select", helpText: "Controlled design token.", defaultValue: "Default", options: ["Default", "Balloons", "Holiday", "Premium"] }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["Does not edit Square categories.", "Does not edit Square reporting_category.", "Product assignments use website placements."],
    productionChecklist: ["SEO filled", "Hero content approved", "Product grid reviewed", "Mobile preview checked"]
  },
  {
    id: "holidays",
    href: "/admin/holidays",
    title: "Holidays",
    sectionId: "admin.holidays",
    category: "Storefront",
    purpose: "Create and edit holiday campaigns, active dates, hero copy, SEO, accent theme, product assignments, and scheduling.",
    productionGoal: "Launch seasonal pages without code deploys.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Marketing"],
    connectedModels: ["Holiday", "CmsContentVersion", "WebsiteProductPlacement"],
    editableFields: [
      { name: "holidaySlug", label: "Holiday slug", type: "text", required: true, helpText: "Holiday route identifier.", defaultValue: "graduation" },
      ...contentFields,
      { name: "activeFrom", label: "Active from", type: "datetime", helpText: "Campaign start timestamp.", defaultValue: "" },
      { name: "activeUntil", label: "Active until", type: "datetime", helpText: "Campaign end timestamp.", defaultValue: "" },
      ...seoFields
    ],
    workflowActions: fullWorkflow,
    guardrails: ["Holiday products are website placements.", "Date changes are audit logged.", "Expired campaigns can remain archived."],
    productionChecklist: ["Dates verified", "Products assigned", "Hero media approved", "Scheduled unpublish set when needed"]
  },
  {
    id: "products",
    href: "/admin/products",
    title: "Products",
    sectionId: "admin.product-overrides",
    category: "Catalog",
    purpose: "Review Square catalog cache and manage website-only visibility, assignment readiness, descriptions, badges, and fulfillment flags.",
    productionGoal: "Turn synced Square items into sellable online products without editing Square price or inventory.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Catalog"],
    connectedModels: ["SquareCatalogObject", "ProductOverride", "WebsiteProductPlacement"],
    editableFields: [...productFields, ...scheduleFields],
    workflowActions: fullWorkflow,
    guardrails: ["Square price is read-only.", "Square inventory is read-only.", "Publishing requires description and image readiness."],
    productionChecklist: ["Description present", "Image selected", "Fulfillment mode set", "Placement assigned"]
  },
  {
    id: "product-placement",
    href: "/admin/product-placement",
    title: "Product Placement Manager",
    sectionId: "admin.product-placement-manager",
    category: "Merchandising",
    purpose: "Create website categories and holidays, then approve Square products by surface, age range, fulfillment, order, and campaign dates.",
    productionGoal: "Publish the real Square catalog intentionally without copying or changing Square categories.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Catalog", "Marketing"],
    connectedModels: ["WebsiteProductPlacement", "ProductPlacementRule", "ProductOverride"],
    editableFields: [
      { name: "squareVariationId", label: "Square variation ID", type: "text", required: true, helpText: "Product variation to place.", defaultValue: "SQ_VARIATION_ID" },
      { name: "placementType", label: "Placement type", type: "select", required: true, helpText: "Website destination type.", defaultValue: "Department", options: ["Homepage", "Department", "Holiday", "Balloon", "Search group", "Promo"] },
      { name: "sectionId", label: "Section ID", type: "text", required: true, helpText: "Target section registry ID.", defaultValue: "home.featured-products" },
      { name: "sortOrder", label: "Sort order", type: "number", helpText: "Display order in target section.", defaultValue: 10 },
      { name: "featured", label: "Featured", type: "boolean", helpText: "Pin or highlight in the target section.", defaultValue: false },
      { name: "visible", label: "Visible", type: "boolean", helpText: "Show this placement online.", defaultValue: false },
      ...scheduleFields
    ],
    workflowActions: fullWorkflow,
    guardrails: ["Never changes Square category/reporting_category.", "A product may have many placements.", "Placement publish is separate from product web visibility."],
    productionChecklist: ["Target section exists", "Product visible online", "Sort order reviewed", "Preview approved"]
  },
  {
    id: "product-display",
    href: "/admin/product-display",
    title: "Product Display",
    sectionId: "admin.product-display",
    category: "Catalog",
    purpose: "Edit website-only product titles, short descriptions, full descriptions, badges, card style, visibility, and fulfillment display.",
    productionGoal: "Make Square products shopper-ready without mutating Square data.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Catalog"],
    connectedModels: ["ProductOverride", "CmsContentVersion"],
    editableFields: productFields,
    workflowActions: fullWorkflow,
    guardrails: ["Square item name remains read-only.", "Square description can be used as fallback.", "Locked descriptions require manager approval."],
    productionChecklist: ["Title reviewed", "Short description present", "Badge appropriate", "Visibility intentional"]
  },
  {
    id: "product-overrides",
    href: "/admin/product-overrides",
    title: "Product overrides",
    sectionId: "admin.product-overrides",
    category: "Catalog",
    purpose: "Manage website-only product visibility, SEO, badges, image display preferences, fulfillment eligibility, and review status in one place.",
    productionGoal: "Give catalog staff a single product override editor without changing Square prices or inventory.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Catalog"],
    connectedModels: ["ProductOverride", "ProductImagePreference", "WebsiteProductPlacement"],
    editableFields: [...productFields, ...seoFields, { name: "needsReview", label: "Needs review", type: "boolean", helpText: "Flag this product for manager review.", defaultValue: false }],
    workflowActions: fullWorkflow,
    guardrails: ["Overrides are website-only.", "Square pricing remains read-only.", "Square inventory remains read-only."],
    productionChecklist: ["Visibility reviewed", "SEO reviewed", "Image preference checked", "Fulfillment checked"]
  },
  {
    id: "product-seo",
    href: "/admin/product-seo",
    title: "Product SEO",
    sectionId: "admin.product-seo",
    category: "Catalog",
    purpose: "Edit website-only product SEO titles, descriptions, canonical URLs, Open Graph media, internal tags, and search keywords.",
    productionGoal: "Control search presentation product-by-product without Square writes.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Marketing"],
    connectedModels: ["ProductOverride", "MediaAsset"],
    editableFields: [
      { name: "squareVariationId", label: "Square variation ID", type: "text", required: true, helpText: "Product variation to optimize.", defaultValue: "SQ_VARIATION_ID" },
      ...seoFields,
      { name: "openGraphImage", label: "Open Graph image", type: "url", helpText: "Media asset URL for social sharing.", defaultValue: "" }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["Canonical URLs must be internal or HTTPS.", "SEO edits are website-only.", "Media must use approved library assets."],
    productionChecklist: ["SEO title length reviewed", "Description reviewed", "Canonical set", "OG image alt text available"]
  },
  {
    id: "product-images",
    href: "/admin/product-images",
    title: "Product Images",
    sectionId: "admin.product-images",
    category: "Catalog",
    purpose: "Control primary image, gallery order, alt text, hidden website images, card image, detail image, and crop preset.",
    productionGoal: "Let staff curate product visuals without deleting or reordering Square images.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Catalog", "Marketing"],
    connectedModels: ["ProductImagePreference", "MediaAsset", "SquareCatalogObject"],
    editableFields: [
      { name: "catalogObjectId", label: "Catalog object ID", type: "text", required: true, helpText: "Square catalog object to curate.", defaultValue: "SQ_IMAGE_OBJECT" },
      { name: "imageUrl", label: "Image URL", type: "url", required: true, helpText: "Approved product image URL.", defaultValue: "" },
      { name: "altText", label: "Alt text", type: "text", required: true, helpText: "Accessible image description.", defaultValue: "" },
      { name: "isPrimary", label: "Primary image", type: "boolean", helpText: "Use as primary website image.", defaultValue: false },
      { name: "sortOrder", label: "Gallery sort order", type: "number", helpText: "Lower numbers appear first.", defaultValue: 10 },
      { name: "cropPreset", label: "Crop preset", type: "select", helpText: "Controlled crop setting.", defaultValue: "Square", options: ["Square", "Portrait", "Landscape", "Natural"] }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["Does not delete Square images.", "Alt text required before publish.", "External image sources must be approved."],
    productionChecklist: ["Primary selected", "Alt text complete", "Gallery order checked", "Mobile card checked"]
  },
  {
    id: "balloons",
    href: "/admin/balloons",
    title: "Balloon Builder",
    sectionId: "admin.balloon-builder",
    category: "Merchandising",
    purpose: "Manage balloon templates, stocked variation mapping, non-stocked add-ons, colors, ribbons, occasions, fulfillment rules, and prep capacity.",
    productionGoal: "Control the balloon builder like a guided product configurator.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Catalog", "Fulfillment"],
    connectedModels: ["ProductOverride", "WebsiteProductPlacement", "CmsContentVersion"],
    editableFields: [
      { name: "templateName", label: "Template name", type: "text", required: true, helpText: "Reusable balloon template name.", defaultValue: "Birthday bouquet" },
      { name: "eligibleTypes", label: "Eligible types", type: "list", helpText: "Comma-separated balloon types.", defaultValue: ["Latex", "Mylar", "Numbers"] },
      { name: "capacityPoints", label: "Capacity points", type: "number", helpText: "Fulfillment capacity cost for this template.", defaultValue: 2 },
      { name: "requiresPrep", label: "Requires prep", type: "boolean", helpText: "Adds balloon prep workflow.", defaultValue: true },
      { name: "fulfillmentMode", label: "Fulfillment mode", type: "select", helpText: "Eligible fulfillment modes.", defaultValue: "Pickup + local delivery", options: fulfillmentOptions }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["Stocked items must map to Square variations.", "Capacity points are server-validated.", "Payment behavior is not editable here."],
    productionChecklist: ["Square mapping checked", "Capacity checked", "Add-ons reviewed", "Preview builder flow"]
  },
  {
    id: "delivery-zones",
    href: "/admin/delivery-zones",
    title: "Delivery Zones",
    sectionId: "admin.delivery-zones",
    category: "Operations",
    purpose: "Edit local delivery zones, GeoJSON polygons, fees, lead times, cutoffs, service mode, and store assignment.",
    productionGoal: "Control local delivery coverage without code while server validation remains authoritative.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Delivery"],
    connectedModels: ["DeliveryZone", "AuditLog"],
    editableFields: [
      { name: "zoneName", label: "Zone name", type: "text", required: true, helpText: "Internal and admin-facing zone name.", defaultValue: "UES local delivery" },
      { name: "feeCents", label: "Delivery fee cents", type: "number", required: true, helpText: "Fee in cents. Checkout recalculates server-side.", defaultValue: 999 },
      { name: "leadTimeMinutes", label: "Lead time minutes", type: "number", helpText: "Minimum lead time for orders.", defaultValue: 120 },
      { name: "cutoffTime", label: "Cutoff time", type: "text", helpText: "Daily cutoff in local store time.", defaultValue: "15:00" },
      { name: "geoJson", label: "GeoJSON polygon", type: "json", helpText: "Polygon stored server-side for validation.", defaultValue: "{}" },
      { name: "enabled", label: "Enabled", type: "boolean", helpText: "Enable this delivery zone.", defaultValue: false }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Checkout never trusts browser-side zone checks.", "Polygon edits require audit log.", "Fees are recalculated on the server."],
    productionChecklist: ["Polygon valid", "Fee checked", "Cutoff checked", "Test address verified"]
  },
  {
    id: "slots",
    href: "/admin/slots",
    title: "Pickup and Delivery Slots",
    sectionId: "admin.pickup-slots",
    category: "Operations",
    purpose: "Edit pickup and local delivery slot windows, capacity points, cutoffs, blackout dates, and temporary holds.",
    productionGoal: "Let staff control availability without risking oversells.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Fulfillment", "Delivery"],
    connectedModels: ["FulfillmentSlot", "SlotCapacityHold", "AuditLog"],
    editableFields: [
      { name: "slotName", label: "Slot name", type: "text", required: true, helpText: "Admin label for the slot window.", defaultValue: "Morning pickup" },
      { name: "startsAt", label: "Starts at", type: "datetime", required: true, helpText: "Slot start timestamp.", defaultValue: "" },
      { name: "endsAt", label: "Ends at", type: "datetime", required: true, helpText: "Slot end timestamp.", defaultValue: "" },
      { name: "capacityPoints", label: "Capacity points", type: "number", required: true, helpText: "Total capacity for this slot.", defaultValue: 20 },
      { name: "enabled", label: "Enabled", type: "boolean", helpText: "Make this slot available.", defaultValue: false }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Capacity is locked transactionally.", "Temporary holds expire server-side.", "Staff cannot bypass checkout validation."],
    productionChecklist: ["Capacity checked", "Blackout dates checked", "Cutoffs checked", "Order flow tested"]
  },
  {
    id: "media-library",
    href: "/admin/media-library",
    title: "Media Library",
    sectionId: "admin.media-library",
    category: "Storefront",
    purpose: "Manage approved website media assets, alt text, visibility, usage context, dimensions, and source attribution.",
    productionGoal: "Give staff a safe asset library for homepage, departments, holidays, products, and social previews.",
    riskLevel: "medium",
    ownerRoles: ["Owner", "Manager", "Marketing", "Catalog"],
    connectedModels: ["MediaAsset", "CmsContentVersion"],
    editableFields: [
      { name: "url", label: "Asset URL", type: "url", required: true, helpText: "Approved media URL.", defaultValue: "" },
      { name: "altText", label: "Alt text", type: "text", required: true, helpText: "Accessible media description.", defaultValue: "" },
      { name: "usage", label: "Usage", type: "select", helpText: "Primary use for this asset.", defaultValue: "Homepage", options: ["Homepage", "Department", "Holiday", "Product", "Social"] },
      { name: "hiddenFromWebsite", label: "Hidden from website", type: "boolean", helpText: "Keep asset unavailable to public modules.", defaultValue: false }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["No secret files.", "Alt text required before publish.", "Uploads should be virus-scanned by storage provider."],
    productionChecklist: ["Alt text complete", "Source approved", "Dimensions checked", "Usage assigned"]
  },
  {
    id: "theme",
    href: "/admin/theme",
    title: "Theme",
    sectionId: "admin.homepage-sections",
    category: "Storefront",
    purpose: "Select controlled theme presets, accent tokens, homepage visual density, button preset, and seasonal styling without arbitrary CSS.",
    productionGoal: "Let the store tune the look of the site inside approved design-system boundaries.",
    riskLevel: "high",
    ownerRoles: ["Owner", "Manager", "Marketing"],
    connectedModels: ["CmsContentVersion", "AuditLog"],
    editableFields: [
      { name: "themePreset", label: "Theme preset", type: "select", required: true, helpText: "Approved visual theme.", defaultValue: "Default", options: ["Default", "Premium", "Holiday", "Balloons"] },
      { name: "accent", label: "Accent", type: "select", helpText: "Controlled accent token.", defaultValue: "Default", options: ["Default", "Holiday", "Balloons", "Premium"] },
      { name: "buttonPreset", label: "Button preset", type: "select", helpText: "Approved button style.", defaultValue: "Primary", options: ["Primary", "Secondary", "Accent"] },
      { name: "announcement", label: "Announcement text", type: "textarea", helpText: "Optional storefront announcement copy.", defaultValue: "" },
      { name: "enabled", label: "Enabled", type: "boolean", helpText: "Enable this theme draft.", defaultValue: false }
    ],
    workflowActions: fullWorkflow,
    guardrails: ["No arbitrary CSS.", "Only token-backed presets are editable.", "Theme publishes are auditable and reversible."],
    productionChecklist: ["Contrast checked", "Mobile header checked", "Homepage checked", "Rollback available"]
  },
  {
    id: "orders",
    href: "/admin/orders",
    title: "Orders",
    sectionId: "admin.fulfillment-dashboard",
    category: "Operations",
    purpose: "View order mirrors, payment state, customer service context, fulfillment groups, pickup/delivery/shipping status, and safe notes.",
    productionGoal: "Provide operational order control without exposing raw payment data.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Store staff", "Fulfillment"],
    connectedModels: ["Order", "FulfillmentGroup", "AuditLog"],
    editableFields: [
      { name: "orderId", label: "Order ID", type: "text", required: true, helpText: "Order mirror ID.", defaultValue: "ORDER_ID" },
      { name: "staffNote", label: "Staff note", type: "textarea", helpText: "Internal customer service note.", defaultValue: "" },
      { name: "status", label: "Order status", type: "select", helpText: "Operational status.", defaultValue: "Needs review", options: ["Needs review", "Confirmed", "Preparing", "Ready", "Completed", "Canceled"] }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["No raw card data.", "Payment status comes from Square.", "Customer PII is role-scoped."],
    productionChecklist: ["Role scope checked", "Status transition valid", "Customer note appropriate", "Audit event created"]
  },
  {
    id: "fulfillment",
    href: "/admin/fulfillment",
    title: "Fulfillment",
    sectionId: "admin.fulfillment-dashboard",
    category: "Operations",
    purpose: "Manage pickup queue, balloon prep queue, local delivery queue, warehouse shipping queue, staff status transitions, and exception handling.",
    productionGoal: "Run the store's daily operations from a single role-scoped queue.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Fulfillment", "Delivery", "Warehouse"],
    connectedModels: ["FulfillmentGroup", "SlotCapacityHold", "AuditLog"],
    editableFields: [
      { name: "fulfillmentGroupId", label: "Fulfillment group ID", type: "text", required: true, helpText: "Queue item to update.", defaultValue: "FULFILLMENT_GROUP_ID" },
      { name: "queue", label: "Queue", type: "select", helpText: "Operational queue.", defaultValue: "Pickup", options: ["Pickup", "Balloon prep", "Local delivery", "Warehouse shipping"] },
      { name: "status", label: "Status", type: "select", helpText: "Fulfillment status.", defaultValue: "Preparing", options: ["Queued", "Preparing", "Ready", "Out for delivery", "Completed", "Exception"] },
      { name: "staffNote", label: "Staff note", type: "textarea", helpText: "Internal fulfillment note.", defaultValue: "" }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Status transitions are role-scoped.", "Capacity and payment remain server-owned.", "PII is minimized."],
    productionChecklist: ["Queue visible", "Transition valid", "Staff note reviewed", "Audit event created"]
  },
  {
    id: "shipping",
    href: "/admin/shipping",
    title: "Shipping",
    sectionId: "admin.fulfillment-dashboard",
    category: "Operations",
    purpose: "Configure warehouse shipping settings, carrier abstraction, label workflow, package presets, warehouse-only products, and fulfillment exceptions.",
    productionGoal: "Prepare shippable orders while carrier purchases stay server-controlled.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager", "Warehouse"],
    connectedModels: ["ShippingRate", "FulfillmentGroup", "AuditLog"],
    editableFields: [
      { name: "packagePreset", label: "Package preset", type: "text", required: true, helpText: "Reusable package preset.", defaultValue: "Small box" },
      { name: "carrier", label: "Carrier", type: "select", helpText: "Preferred carrier provider.", defaultValue: "Shippo", options: ["Shippo", "FedEx", "UPS", "USPS"] },
      { name: "enabled", label: "Enabled", type: "boolean", helpText: "Enable this shipping preset.", defaultValue: false },
      { name: "handlingTimeDays", label: "Handling time days", type: "number", helpText: "Expected handling time.", defaultValue: 2 }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Label purchases require server credentials.", "Rates are recalculated server-side.", "Warehouse routing is audited."],
    productionChecklist: ["Carrier credential present", "Package dimensions checked", "Rate test passed", "Label workflow tested"]
  },
  {
    id: "locations",
    href: "/admin/locations",
    title: "Locations",
    sectionId: "admin.fulfillment-dashboard",
    category: "Operations",
    purpose: "Manage storefront location display, Square location mapping, store hours, pickup availability, and warehouse fulfillment configuration.",
    productionGoal: "Keep location information and fulfillment mapping editable while Square location IDs stay protected.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager"],
    connectedModels: ["StoreLocation", "CmsContentVersion", "AuditLog"],
    editableFields: [
      { name: "locationName", label: "Location name", type: "text", required: true, helpText: "Public location name.", defaultValue: "86th Street" },
      { name: "squareLocationId", label: "Square location ID", type: "text", required: true, helpText: "Protected Square location reference.", defaultValue: "SQ_LOCATION_ID" },
      { name: "pickupEnabled", label: "Pickup enabled", type: "boolean", helpText: "Allow pickup from this location.", defaultValue: true },
      { name: "hours", label: "Hours", type: "textarea", helpText: "Public store hours.", defaultValue: "Mon-Sat 10-6" },
      { name: "warehouseEnabled", label: "Warehouse enabled", type: "boolean", helpText: "Use this location for warehouse fulfillment.", defaultValue: false }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Square location IDs are references only.", "Pickup rules are server-validated.", "Warehouse routing changes are audited."],
    productionChecklist: ["Square location mapped", "Hours verified", "Pickup tested", "Warehouse routing reviewed"]
  },
  {
    id: "sync-status",
    href: "/admin/sync-status",
    title: "Sync status",
    sectionId: "admin.fulfillment-dashboard",
    category: "System",
    purpose: "Monitor Square catalog, inventory, image, location, tax, order, payment, and webhook sync state with safe replay controls.",
    productionGoal: "Give staff visibility into integrations without exposing credentials.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager"],
    connectedModels: ["SquareCatalogObject", "AuditLog"],
    editableFields: [
      { name: "syncScope", label: "Sync scope", type: "select", required: true, helpText: "Integration area to inspect.", defaultValue: "Catalog", options: ["Catalog", "Inventory", "Images", "Locations", "Taxes", "Orders", "Payments"] },
      { name: "manualReview", label: "Manual review", type: "boolean", helpText: "Flag sync state for manual review.", defaultValue: false },
      { name: "staffNote", label: "Staff note", type: "textarea", helpText: "Internal sync note.", defaultValue: "" }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["No Square secrets are shown.", "Replay actions must be server-side.", "Manual review flags are audited."],
    productionChecklist: ["Scope selected", "Latest sync visible", "Errors reviewed", "Replay path protected"]
  },
  {
    id: "webhooks",
    href: "/admin/webhooks",
    title: "Webhooks",
    sectionId: "admin.fulfillment-dashboard",
    category: "System",
    purpose: "Inspect Square webhook delivery, signature validation, replay protection, processing state, and operational notes.",
    productionGoal: "Operate webhook reliability without leaking secrets or weakening signature checks.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager"],
    connectedModels: ["AuditLog", "SquareWebhookEvent"],
    editableFields: [
      { name: "eventId", label: "Webhook event ID", type: "text", required: true, helpText: "Webhook event to review.", defaultValue: "WEBHOOK_EVENT_ID" },
      { name: "processingState", label: "Processing state", type: "select", helpText: "Current operational state.", defaultValue: "Needs review", options: ["Needs review", "Processed", "Ignored", "Replay requested", "Failed"] },
      { name: "staffNote", label: "Staff note", type: "textarea", helpText: "Internal webhook note.", defaultValue: "" }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Signature validation cannot be disabled.", "Secrets are never displayed.", "Replay requests must be audited."],
    productionChecklist: ["Signature valid", "Event id present", "Processing state clear", "Replay reason documented"]
  },
  {
    id: "users-roles",
    href: "/admin/users-roles",
    title: "Users & Roles",
    sectionId: "admin.users-roles",
    category: "Settings",
    purpose: "Manage admin users, roles, location scope, MFA readiness, active status, and permission boundaries.",
    productionGoal: "Control who can edit and publish every part of the store.",
    riskLevel: "critical",
    ownerRoles: ["Owner"],
    connectedModels: ["AdminUser", "AuditLog"],
    editableFields: [
      { name: "email", label: "Email", type: "text", required: true, helpText: "Admin account email.", defaultValue: "manager@example.com" },
      { name: "role", label: "Role", type: "select", required: true, helpText: "Permission role.", defaultValue: "Manager", options: ["Owner", "Manager", "Marketing", "Catalog", "Store staff", "Fulfillment", "Delivery", "Warehouse", "Viewer"] },
      { name: "locationScope", label: "Location scope", type: "list", helpText: "Allowed locations or warehouses.", defaultValue: ["86th Street"] },
      { name: "mfaReady", label: "MFA ready", type: "boolean", helpText: "Account is ready for MFA enforcement.", defaultValue: false },
      { name: "active", label: "Active", type: "boolean", helpText: "Allow this admin account.", defaultValue: true }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Only owners can change owner-level access.", "Password internals are not edited here.", "Every role change is audit logged."],
    productionChecklist: ["Owner approval", "MFA checked", "Location scope checked", "Audit event created"]
  },
  {
    id: "audit-log",
    href: "/admin/audit-log",
    title: "Audit Log",
    sectionId: "admin.fulfillment-dashboard",
    category: "System",
    purpose: "Review and annotate every admin change to content, catalog overrides, zones, slots, users, fulfillment, and theme settings.",
    productionGoal: "Make production changes accountable and reversible.",
    riskLevel: "critical",
    ownerRoles: ["Owner", "Manager"],
    connectedModels: ["AuditLog", "CmsContentVersion"],
    editableFields: [
      { name: "entityId", label: "Entity ID", type: "text", helpText: "Entity being reviewed.", defaultValue: "" },
      { name: "reviewNote", label: "Review note", type: "textarea", helpText: "Internal audit review note.", defaultValue: "" },
      { name: "resolved", label: "Resolved", type: "boolean", helpText: "Mark an audit item as reviewed.", defaultValue: false }
    ],
    workflowActions: operationsWorkflow,
    guardrails: ["Audit records are append-only.", "Reviews do not delete history.", "Critical changes require owner visibility."],
    productionChecklist: ["Event traceable", "Actor present", "Entity present", "Review note clear"]
  }
];

export function getAdminModuleById(id: string) {
  return adminModules.find((module) => module.id === id);
}

export function getAdminModuleForPage(sectionId: string, title?: string) {
  const modulesBySection = adminModules.filter((module) => module.sectionId === sectionId);
  const normalizedTitle = normalizeTitle(title);
  const exactMatch = modulesBySection.find((module) => normalizeTitle(module.title) === normalizedTitle);

  if (exactMatch) {
    return exactMatch;
  }

  return modulesBySection.length === 1 ? modulesBySection[0] : undefined;
}

function normalizeTitle(title?: string) {
  return (title ?? "").trim().toLowerCase();
}

export function getAdminModulesByCategory() {
  return adminModules.reduce<Record<AdminModule["category"], AdminModule[]>>(
    (groups, module) => {
      groups[module.category].push(module);
      return groups;
    },
    {
      Storefront: [],
      Catalog: [],
      Merchandising: [],
      Operations: [],
      Settings: [],
      System: []
    }
  );
}
