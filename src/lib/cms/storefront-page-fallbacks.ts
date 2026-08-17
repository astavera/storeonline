/**
 * Provides shared storefront page fallbacks types and utilities for the application.
 */

import type { StorefrontEditablePage } from "@/config/storefront-pages.config";
import { balloonBuilderStepLabels, balloonBuilderSteps, balloonFlows } from "@/config/balloons.config";
import { getDepartmentBySlug } from "@/config/departments.config";
import { getHolidayBySlug, holidays } from "@/config/holidays.config";
import { getLocationBySlug, storeLocations } from "@/config/locations.config";
import { getProductBySlug } from "@/features/catalog/product-catalog";
import type { CmsPageDocument, CmsScope, CmsSection } from "./cms-types";
import { createCmsPageDocumentForScope } from "./page-templates";
import { createCmsSection } from "./section-registry";

export function createStorefrontEditorFallbackDocument(input: {
  editablePage?: StorefrontEditablePage;
  entityId: string;
  scope: CmsScope;
}): CmsPageDocument {
  const genericDocument = createCmsPageDocumentForScope(input.scope, input.entityId, {
    slug: input.editablePage?.route,
    title: input.editablePage?.title
  });

  if (!input.editablePage) {
    return withoutGlobalFrameSections(genericDocument);
  }

  const sections = sectionsForEditablePage(input.editablePage);

  return {
    ...genericDocument,
    sections: sections.length > 0 ? sections : withoutGlobalFrameSections(genericDocument).sections
  };
}

export function shouldUseStorefrontEditorFallbackDocument(input: {
  document: CmsPageDocument | null;
  editablePage?: StorefrontEditablePage;
}) {
  const document = input.document;
  const page = input.editablePage;

  if (!document || !page) {
    return false;
  }

  const sectionIds = new Set(document.sections.map((section) => section.id));
  const sectionTypes = new Set(document.sections.map((section) => String(section.type)));
  const hasGlobalFrameSections = ["header", "footer", "announcementBar"].some((type) => sectionTypes.has(type));
  const expectedPrimarySectionId = primarySectionIdForEditablePage(page);

  if (!expectedPrimarySectionId || sectionIds.has(expectedPrimarySectionId)) {
    return false;
  }

  return hasGlobalFrameSections || legacyTemplateSectionIds.some((sectionId) => sectionIds.has(sectionId));
}

function sectionsForEditablePage(page: StorefrontEditablePage): CmsSection[] {
  if (page.route === "/shop") {
    return [
      createCmsSection("productGrid", {
        id: "shop.index",
        label: "Shop catalog",
        variant: "catalog",
        content: {
          eyebrow: "",
          title: "Shop",
          body: "",
          primaryCtaLabel: "",
          primaryCtaHref: "",
          items: []
        },
        dataSource: {
          type: "productPlacement",
          id: "shop"
        },
        layout: {
          columns: 3,
          containerWidth: "wide",
          paddingTop: 32,
          paddingBottom: 48,
          imagePosition: "none"
        }
      })
    ];
  }

  if (isBalloonPage(page)) {
    return createBalloonPageSections(page);
  }

  if (page.scope === "department") {
    const department = getDepartmentBySlug(page.entityId);
    const imageOnlyDepartment = page.entityId === "toys" || page.entityId === "party-supplies";

    return [
      createCmsSection("hero", {
        id: `${page.entityId}.hero`,
        label: `${page.title} hero`,
        variant: imageOnlyDepartment ? "image-only" : department?.layout_preset ?? "standard",
        content: {
          eyebrow: "",
          title: imageOnlyDepartment ? page.title : department?.hero_title_en ?? page.title,
          body: imageOnlyDepartment ? "" : department?.hero_subtitle_en ?? page.description,
          primaryCtaLabel: imageOnlyDepartment ? "" : "Browse products",
          primaryCtaHref: imageOnlyDepartment ? "" : "/shop",
          items: []
        },
        media: {
          image: department?.hero_image_url ?? "",
          imageAlt: page.title
        },
        layout: {
          columns: 1,
          containerWidth: "wide",
          imagePosition: department?.hero_image_url ? "background" : "none",
          paddingTop: imageOnlyDepartment ? 0 : 112,
          paddingBottom: imageOnlyDepartment ? 0 : 56
        },
        design: {
          backgroundTone: department?.hero_image_url ? "dark" : "default"
        },
        dataSource: {
          type: "department",
          id: page.entityId
        }
      }),
      ...(page.entityId === "party-supplies"
        ? [
            createCmsSection("featuredCategories", {
              id: "party-supplies.event-types",
              label: "Plan by occasion",
              variant: "grid",
              content: {
                title: "Plan by occasion",
                body: "",
                items: [
                  { id: "birthdays", title: "Birthdays", body: "Theme, table, decor, wrap, and balloon-friendly picks." },
                  { id: "graduations", title: "Graduations", body: "Theme, table, decor, wrap, and balloon-friendly picks." },
                  { id: "showers", title: "Showers", body: "Theme, table, decor, wrap, and balloon-friendly picks." },
                  { id: "weddings", title: "Weddings", body: "Theme, table, decor, wrap, and balloon-friendly picks." }
                ]
              },
              layout: {
                columns: 4,
                imagePosition: "none"
              }
            })
          ]
        : []),
      createCmsSection("productGrid", {
        id: `${page.entityId}.product-grid`,
        label: `${page.title} product grid`,
        variant: department?.product_grid_preset ?? "standard",
        content: {
          eyebrow: "",
          title: page.title,
          body: department?.description_en ?? "",
          primaryCtaLabel: "",
          primaryCtaHref: "",
          items: []
        },
        dataSource: {
          type: "department",
          id: page.entityId
        },
        layout: {
          columns: 3,
          containerWidth: "wide",
          imagePosition: "none",
          paddingTop: 64,
          paddingBottom: 64
        }
      })
    ];
  }

  if (page.scope === "holiday") {
    return createHolidayPageSections(page);
  }

  if (page.scope === "location") {
    return createLocationPageSections(page);
  }

  if (page.scope === "product") {
    return createProductPageSections(page);
  }

  if (page.scope === "policy" || page.group === "Content") {
    return [
      createCmsSection("editorialStory", {
        id: contentSectionIdForEditablePage(page),
        label: page.title,
        variant: "editorial-content",
        content: {
          eyebrow: page.scope === "policy" ? "Policy" : "",
          title: page.title,
          body: page.description,
          primaryCtaLabel: "",
          primaryCtaHref: "",
          items: []
        },
        layout: {
          columns: 1,
          containerWidth: "normal",
          imagePosition: "none",
          paddingTop: 64,
          paddingBottom: 64
        }
      })
    ];
  }

  return [];
}

function createBalloonPageSections(page: StorefrontEditablePage): CmsSection[] {
  const balloons = getDepartmentBySlug("balloons");
  const flowSlug = page.entityId.startsWith("balloons-") ? page.entityId.replace("balloons-", "") : "";
  const selectedFlow = balloonFlows.find((flow) => flow.slug === flowSlug);
  const title =
    selectedFlow?.title ??
    (flowSlug === "local-delivery" ? "Balloon Local Delivery" : flowSlug === "pickup" ? "Balloon Store Pickup" : balloons?.hero_title_en ?? "Balloons planned around your moment.");
  const body =
    selectedFlow?.description ??
    (flowSlug === "local-delivery"
      ? "Local delivery ordering is coming soon. Contact the store with your address and event date to ask about availability."
      : flowSlug === "pickup"
        ? "Choose a store and available pickup time for your balloon order."
        : balloons?.hero_subtitle_en ?? page.description);

  return [
    createCmsSection("hero", {
      id: "balloons.landing-hero",
      label: "Balloons landing hero",
      variant: flowSlug || "landing",
      content: {
        eyebrow: "Balloons",
        title,
        body,
        primaryCtaLabel: "Explore bouquets",
        primaryCtaHref: "/balloons/bouquets",
        items: []
      },
      media: {
        image: balloons?.hero_image_url ?? "",
        imageAlt: title
      },
      layout: {
        containerWidth: "wide",
        imagePosition: balloons?.hero_image_url ? "background" : "none",
        paddingTop: 112,
        paddingBottom: 56
      },
      design: {
        backgroundTone: balloons?.hero_image_url ? "dark" : "default"
      },
      dataSource: {
        type: "department",
        id: "balloons"
      }
    }),
    createCmsSection("featuredCategories", {
      id: "balloons.builder",
      label: "Plan your balloon order",
      variant: "guided",
      content: {
        title: "Plan your balloon order",
        body: "Browse balloon types and planning steps, then confirm colors, timing, store pickup, or local delivery.",
        items: balloonBuilderSteps.map((step) => ({
          id: step,
          title: balloonBuilderStepLabels[step],
          body: "Choose your preferences. Final availability is confirmed by the store."
        }))
      },
      layout: {
        columns: 3,
        containerWidth: "wide",
        imagePosition: "none",
        paddingTop: 64,
        paddingBottom: 64
      }
    }),
    createCmsSection("featuredCategories", {
      id: "balloons.type-selector",
      label: "Choose a balloon style",
      variant: "flow-cards",
      content: {
        title: "Choose a balloon style",
        body: "",
        items: balloonFlows.map((flow) => ({
          id: flow.slug,
          label: "View options",
          title: flow.title,
          body: flow.description,
          href: `/balloons/${flow.slug}`
        }))
      },
      layout: {
        columns: 4,
        containerWidth: "wide",
        imagePosition: "none",
        paddingTop: 64,
        paddingBottom: 64
      }
    }),
    createCmsSection("pickupDeliveryInfo", {
      id: "balloons.fulfillment-selector",
      label: "Store pickup and local delivery",
      variant: "pickup-delivery",
      content: {
        title: "Store pickup and local delivery",
        body: "",
        items: [
          { id: "pickup", title: "Store pickup", body: "Choose your preferred store and an available pickup time." },
          { id: "local-delivery", title: "Local delivery", body: "Contact us with your delivery address and event date to check availability and pricing." }
        ]
      },
      layout: {
        columns: 2,
        containerWidth: "wide",
        paddingTop: 56,
        paddingBottom: 56
      }
    }),
    createCmsSection("editorialStory", {
      id: "balloons.time-slot-picker",
      label: "Timing and availability",
      variant: "timing-availability",
      content: {
        title: "Timing and availability",
        body: "Balloon orders may require advance notice. Your pickup or local delivery window is confirmed before checkout.",
        items: []
      },
      layout: {
        columns: 1,
        containerWidth: "wide",
        imagePosition: "none",
        paddingTop: 56,
        paddingBottom: 56
      },
      design: {
        backgroundTone: "muted"
      }
    })
  ];
}

function createHolidayPageSections(page: StorefrontEditablePage): CmsSection[] {
  if (page.entityId === "index") {
    return [
      createCmsSection("holidayHero", {
        id: "holidays.index-hero",
        label: "Holidays index hero",
        variant: "parent",
        content: {
          eyebrow: "Holidays",
          title: "Seasonal favorites for every celebration.",
          body: "Find timely gifts, party supplies, cards, decorations, and neighborhood favorites throughout the year.",
          items: []
        },
        layout: {
          containerWidth: "wide",
          imagePosition: "none",
          paddingTop: 64,
          paddingBottom: 64
        },
        design: {
          backgroundTone: "muted"
        },
        dataSource: {
          type: "holiday",
          id: "index"
        }
      }),
      createCmsSection("holidayCollection", {
        id: "holidays.active-holidays-grid",
        label: "Active holidays grid",
        variant: "holiday-card-grid",
        content: {
          title: "Active holidays",
          body: "",
          items: holidays
            .filter((holiday) => holiday.is_visible)
            .map((holiday) => ({
              id: holiday.slug,
              title: holiday.title_en,
              body: holiday.description_en,
              href: `/holidays/${holiday.slug}`,
              image: holiday.hero_image_url,
              imageAlt: holiday.title_en,
              badge: holiday.is_active ? "Active" : "Scheduled"
            }))
        },
        dataSource: {
          type: "holiday",
          id: "index"
        },
        layout: {
          columns: 4,
          containerWidth: "wide",
          imagePosition: "none",
          paddingTop: 64,
          paddingBottom: 64
        }
      })
    ];
  }

  const holiday = getHolidayBySlug(page.entityId);

  return [
    createCmsSection("holidayHero", {
      id: "holidays.detail-hero",
      label: `${page.title} hero`,
      variant: holiday?.layout_preset ?? "holiday-hero",
      content: {
        eyebrow: page.title,
        title: holiday?.hero_title_en ?? page.title,
        body: holiday?.hero_subtitle_en ?? page.description,
        primaryCtaLabel: "Shop the collection",
        primaryCtaHref: "/shop",
        items: []
      },
      media: {
        image: holiday?.hero_image_url ?? "",
        imageAlt: page.title
      },
      layout: {
        containerWidth: "wide",
        imagePosition: holiday?.hero_image_url ? "background" : "none",
        paddingTop: 112,
        paddingBottom: 56
      },
      design: {
        backgroundTone: holiday?.hero_image_url ? "dark" : "default",
        accentColor: holiday?.custom_accent_color ?? holiday?.accent_color_token
      },
      dataSource: {
        type: "holiday",
        id: page.entityId
      }
    }),
    createCmsSection("seasonalCollection", {
      id: "holidays.detail-product-grid",
      label: `${page.title} product grid`,
      variant: holiday?.product_grid_preset ?? "holiday-card",
      content: {
        title: `${page.title} picks`,
        body: holiday?.description_en ?? page.description,
        items: []
      },
      dataSource: {
        type: "holiday",
        id: page.entityId,
        limit: 4
      },
      layout: {
        columns: 3,
        containerWidth: "wide",
        imagePosition: "none",
        paddingTop: 64,
        paddingBottom: 64
      }
    })
  ];
}

function createLocationPageSections(page: StorefrontEditablePage): CmsSection[] {
  if (page.entityId === "index") {
    return [
      createCmsSection("storeLocationCard", {
        id: "locations.index",
        label: "Locations index",
        variant: "location-card-section",
        content: {
          title: "Two Upper East Side stores.",
          body: "Visit your closest store for neighborhood favorites, helpful service, pickup, and local delivery guidance.",
          items: publicLocationItems()
        },
        dataSource: {
          type: "locationData",
          id: "index"
        },
        layout: {
          columns: 2,
          containerWidth: "wide",
          paddingTop: 64,
          paddingBottom: 64
        },
        design: {
          backgroundTone: "muted"
        }
      })
    ];
  }

  const location = getLocationBySlug(page.entityId);

  return [
    createCmsSection("storeLocationCard", {
      id: `locations.${page.entityId}`,
      label: `${page.title} detail`,
      variant: "location-detail",
      content: {
        title: location?.name ?? page.title,
        body: location ? `${location.address}\n${location.locality}` : page.description,
        items: [
          {
            id: "address",
            title: location?.name ?? page.title,
            body: location ? `${location.address}\n${location.locality}\n${location.phone}\n${location.hours}` : page.description
          },
          {
            id: "fulfillment",
            title: "Fulfillment",
            body: "Contact the store to confirm current availability, pickup timing, or delivery options for your address."
          }
        ]
      },
      dataSource: {
        type: "locationData",
        id: page.entityId
      },
      layout: {
        columns: 2,
        containerWidth: "wide",
        paddingTop: 64,
        paddingBottom: 64
      },
      design: {
        backgroundTone: "muted"
      }
    })
  ];
}

function createProductPageSections(page: StorefrontEditablePage): CmsSection[] {
  const product = process.env.E2E_CATALOG_FIXTURE === "true"
    ? getProductBySlug(page.entityId)
    : null;

  return [
    createCmsSection("productDescription", {
      id: "products.detail",
      label: `${page.title} detail`,
      variant: "product-detail",
      content: {
        eyebrow: product?.department ?? "Product",
        title: product?.name ?? page.title,
        body: product?.description ?? page.description,
        primaryCtaLabel: "Add to cart",
        primaryCtaHref: "",
        items: product
          ? product.fulfillmentModes.map((mode) => ({
              id: mode,
              title: toTitle(mode),
              body: ""
            }))
          : []
      },
      media: {
        image: product?.imageUrl ?? "",
        imageAlt: product?.name ?? page.title
      },
      dataSource: {
        type: "squareCatalog",
        id: page.entityId
      },
      layout: {
        columns: 2,
        containerWidth: "wide",
        imagePosition: "left",
        paddingTop: 64,
        paddingBottom: 64
      }
    })
  ];
}

function primarySectionIdForEditablePage(page: StorefrontEditablePage) {
  if (page.route === "/shop") {
    return "shop.index";
  }

  if (isBalloonPage(page)) {
    return "balloons.landing-hero";
  }

  if (page.scope === "department") {
    return `${page.entityId}.hero`;
  }

  if (page.scope === "holiday") {
    return page.entityId === "index" ? "holidays.index-hero" : "holidays.detail-hero";
  }

  if (page.scope === "location") {
    return page.entityId === "index" ? "locations.index" : `locations.${page.entityId}`;
  }

  if (page.scope === "product") {
    return "products.detail";
  }

  if (page.scope === "policy" || page.group === "Content") {
    return contentSectionIdForEditablePage(page);
  }

  return "";
}

function isBalloonPage(page: StorefrontEditablePage) {
  return page.entityId === "balloons" || page.entityId.startsWith("balloons-");
}

function contentSectionIdForEditablePage(page: StorefrontEditablePage) {
  if (page.scope === "policy") {
    return `policy.${page.entityId}`;
  }

  if (page.entityId === "about") {
    return "about.history";
  }

  if (page.entityId === "contact") {
    return "contact.index";
  }

  if (page.entityId === "search") {
    return "search.index";
  }

  if (page.entityId.startsWith("upper-east-side-") || page.entityId === "nyc-balloon-delivery") {
    return `seo.${page.entityId}`;
  }

  return `${page.entityId}.index`;
}

function publicLocationItems() {
  return storeLocations
    .filter((location) => location.slug !== "warehouse")
    .map((location) => ({
      id: location.slug,
      title: location.name,
      body: `${location.address}\n${location.locality}\n${location.phone}\n${location.hours}`,
      href: `/locations/${location.slug}`
    }));
}

function withoutGlobalFrameSections(document: CmsPageDocument): CmsPageDocument {
  return {
    ...document,
    sections: document.sections.filter((section) => !["header", "footer", "announcementBar"].includes(String(section.type)))
  };
}

function toTitle(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const legacyTemplateSectionIds = [
  "landing.header",
  "landing.hero",
  "landing.promo",
  "landing.products",
  "landing.testimonials",
  "landing.newsletter",
  "landing.footer",
  "department.header",
  "department.hero",
  "department.showcase",
  "department.products",
  "department.local-seo",
  "department.newsletter",
  "department.footer",
  "holiday.header",
  "holiday.hero",
  "holiday.countdown",
  "holiday.gift-guide",
  "holiday.collection",
  "holiday.limited",
  "holiday.footer",
  "location.header",
  "location.hero",
  "location.card",
  "location.map",
  "location.service-area",
  "location.local-seo",
  "location.footer",
  "product.header",
  "product.gallery",
  "product.title",
  "product.price",
  "product.description",
  "product.related",
  "product.footer",
  "policy.header",
  "policy.content",
  "policy.footer"
];
