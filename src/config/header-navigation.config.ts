export type HeaderNavigationLink = {
  id: string;
  label: string;
  href: string;
  visible: boolean;
};

export type HeaderNavigationConfig = {
  primary: HeaderNavigationLink[];
  utility: HeaderNavigationLink[];
  mobileCta: HeaderNavigationLink;
};

export const defaultHeaderNavigation: HeaderNavigationConfig = {
  primary: [
    { id: "shop-all", label: "Shop all", href: "/shop", visible: true },
    { id: "balloon-order", label: "Balloon Order", href: "/balloons", visible: true },
    { id: "toys", label: "Toys", href: "/toys", visible: true },
    { id: "party-supplies", label: "Party Supplies", href: "/party-supplies", visible: true },
    { id: "holidays", label: "Holidays", href: "/holidays", visible: true },
    { id: "about-us", label: "About Us", href: "/about", visible: true }
  ],
  utility: [
    { id: "search", label: "Search", href: "/search", visible: true },
    { id: "account", label: "Account", href: "/contact", visible: true },
    { id: "wishlist", label: "Wishlist", href: "/shop", visible: true },
    { id: "cart", label: "Cart", href: "/cart", visible: true }
  ],
  mobileCta: { id: "mobile-shop", label: "Shop", href: "/shop", visible: true }
};

export function normalizeHeaderNavigation(value: unknown): HeaderNavigationConfig {
  const source = value && typeof value === "object" ? (value as Partial<HeaderNavigationConfig>) : {};

  return {
    primary: normalizeLinks(source.primary, defaultHeaderNavigation.primary),
    utility: normalizeLinks(source.utility, defaultHeaderNavigation.utility),
    mobileCta: normalizeLink(source.mobileCta, defaultHeaderNavigation.mobileCta)
  };
}

function normalizeLinks(value: unknown, fallback: HeaderNavigationLink[]) {
  return Array.isArray(value) && value.length > 0 ? value.map((link, index) => normalizeLink(link, fallback[index] ?? fallback[0])) : fallback;
}

function normalizeLink(value: unknown, fallback: HeaderNavigationLink): HeaderNavigationLink {
  const source = value && typeof value === "object" ? (value as Partial<HeaderNavigationLink>) : {};
  const fallbackId = fallback.id;
  const label = typeof source.label === "string" && source.label.trim() ? source.label.trim() : fallback.label;
  const href = typeof source.href === "string" && source.href.trim() ? source.href.trim() : fallback.href;

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : fallbackId,
    label,
    href,
    visible: source.visible !== false
  };
}
