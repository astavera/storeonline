/*
STORE AREA: Storefront
SECTION: Global Header
SECTION ID: layout.header
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Public navigation order and utility links.
SAFE TO EDIT: Navigation labels and token-based styling.
DO NOT EDIT HERE: Department business rules, Square category mappings, auth, or cart totals.
RELATED FILES: src/config/header-navigation.config.ts, src/design/tokens/colors.css
BUSINESS LOGIC FILES: src/features/departments/services/department-service.ts
*/

import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { defaultHeaderNavigation, type HeaderNavigationConfig, type HeaderNavigationLink } from "@/config/header-navigation.config";
import { holidays } from "@/config/holidays.config";
import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import {
  createStorefrontDepartmentMenus,
  departmentMenuForNavigationLink
} from "@/features/catalog/services/storefront-navigation-menu-service";
import { CartLink } from "./cart-link";
import { HeaderCatalogSearch } from "./header-catalog-search";
import { MobileSiteNavigation } from "./mobile-site-navigation";
import { WishlistLink } from "./wishlist-link";
import { WishlistDrawer } from "./wishlist-drawer";
import { AccountDrawer } from "./account-drawer";
import { AccountLink } from "./account-link";
import { DepartmentMegaMenu } from "./department-mega-menu";
import { HolidayMegaMenu, type HolidayMenuItem } from "./holiday-mega-menu";

const SHOW_MOBILE_FULFILLMENT_SELECTOR = false;

const primaryNavigationHoverClasses = [
  "hover:text-red",
  "hover:text-blue",
  "hover:text-yellow"
] as const;

const holidayMenuOrder = ["halloween", "back-to-school", "valentines-day", "graduation", "christmas"];

const holidayMenuItems: HolidayMenuItem[] = holidays
  .filter((holiday) => holiday.is_visible)
  .map((holiday) => ({
    slug: holiday.slug,
    label: holiday.short_title_en
  }))
  .sort((first, second) => holidayMenuOrder.indexOf(first.slug) - holidayMenuOrder.indexOf(second.slug));

export function SiteHeader({
  categories = [],
  navigation = defaultHeaderNavigation
}: {
  categories?: WebsiteCategory[];
  navigation?: HeaderNavigationConfig;
}) {
  const primaryLinks = navigation.primary.filter((link) => link.visible);
  const configuredDepartmentMenus = createStorefrontDepartmentMenus(categories);
  const departmentMenus = Object.fromEntries(primaryLinks.flatMap((link) => {
    const menu = departmentMenuForNavigationLink(configuredDepartmentMenus, link);
    return menu ? [[link.id, menu]] : [];
  }));
  const utilityLinks = navigation.utility.filter((link) => link.visible);
  const drawerUtilityLinks = utilityLinks.filter((link) => !["account", "cart", "search", "wishlist"].includes(link.id));
  const accountLink = utilityLinks.find((link) => link.id === "account");
  const wishlistLink = utilityLinks.find((link) => link.id === "wishlist");
  const cartLink = utilityLinks.find((link) => link.id === "cart");

  return (
    <header className="sticky top-0 z-[var(--z-header)] bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.18)]" data-store-area="Layout" data-store-component="SiteHeader" data-store-section="layout.header">
      <div
        aria-hidden="true"
        className="modern-state-top-stripe bg-cyan text-primary"
        style={{
          backgroundImage: "url('/assets/modern_state_top_stripe_1920x34.svg?v=20260709')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%"
        }}
      />
      <div className="bg-black px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.08em] text-white sm:hidden">
        Free pickup · Same-day local delivery
      </div>
      <div className="bg-[#FFFFFF] text-black">
        <div className="container-shell homepage-wide-shell flex min-h-[64px] items-center justify-between gap-1 py-2 sm:min-h-[72px] sm:gap-6 sm:py-3 lg:gap-8">
          <MobileSiteNavigation departmentMenus={departmentMenus} holidayLinks={holidayMenuItems} primaryLinks={primaryLinks} utilityLinks={drawerUtilityLinks} />
          <Link className="flex min-w-0 flex-1 items-center justify-center sm:justify-start lg:min-w-[220px] lg:flex-none" data-header-logo href="/">
            <Image alt="Modern State" className="h-auto w-[108px] object-contain sm:w-[230px]" height={56} priority src="/images/modern-state-logo-original.png" style={{ height: "auto" }} width={230} />
            <span className="sr-only">Modern State - Toys, party, balloons and gifts</span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden flex-1 items-center gap-8 text-[15px] font-bold leading-none xl:flex">
            {primaryLinks.map((link, index) => {
              const departmentMenu = departmentMenus[link.id];
              const hoverClassName = primaryNavigationHoverClasses[index % primaryNavigationHoverClasses.length];

              if (departmentMenu) return <DepartmentMegaMenu hoverClassName={hoverClassName} key={link.id} link={link} menu={departmentMenu} />;
              if (link.id === "holidays") return <HolidayMegaMenu holidays={holidayMenuItems} hoverClassName={hoverClassName} key={link.id} link={link} />;

              return <Link className={hoverClassName} data-header-nav-id={link.id} href={link.href} key={link.id}>{link.label}</Link>;
            })}
          </nav>
          <nav aria-label="Utility navigation" className="hidden shrink-0 items-center gap-2 overflow-visible text-[15px] font-semibold xl:flex">
            {utilityLinks.map((link) => (
              <HeaderUtilityLink key={link.id} link={link} />
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 xl:hidden">
            {accountLink ? <HeaderUtilityLink link={accountLink} /> : null}
            {wishlistLink ? <HeaderUtilityLink link={wishlistLink} /> : null}
            {cartLink ? (
              <span data-header-nav-id="cart">
                <CartLink href={cartLink.href} iconOnly label={cartLink.label} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white px-4 py-3 text-black xl:hidden">
        <form action="/search" className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-400 bg-white px-3" method="get" role="search">
          <Search aria-hidden="true" className="shrink-0 text-slate-700" size={19} strokeWidth={2} />
          <label className="sr-only" htmlFor="mobile-header-search">
            Search products
          </label>
          <input className="min-w-0 flex-1 bg-transparent py-2 text-base font-semibold outline-none placeholder:text-slate-500" id="mobile-header-search" name="q" placeholder="Search products" type="search" />
          <button className="sr-only" type="submit">
            Search
          </button>
        </form>
      </div>
      {SHOW_MOBILE_FULFILLMENT_SELECTOR ? (
        <div className="border-t border-slate-200 bg-white px-4 py-3 text-black sm:hidden">
          <p className="text-sm font-black">How would you like to get your order?</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-black">
            <Link className="rounded-lg border border-slate-300 px-2 py-2.5 hover:border-blue hover:text-blue" href="/shipping-policy">
              Shipping
            </Link>
            <Link className="rounded-lg border border-slate-300 px-2 py-2.5 hover:border-blue hover:text-blue" href="/local-delivery-policy">
              Delivery
            </Link>
            <Link className="rounded-lg border border-slate-300 px-2 py-2.5 hover:border-blue hover:text-blue" href="/locations">
              Pickup
            </Link>
          </div>
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="h-[4px] w-full"
        style={{
          backgroundImage:
            "url('/assets/modern_state_top_stripe_1920x34.svg?v=20260709')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%"
        }}
      />
      <WishlistDrawer />
      <AccountDrawer />
    </header>
  );
}

function HeaderUtilityLink({ link }: { link: HeaderNavigationLink }) {
  if (link.id === "search") {
    return <HeaderCatalogSearch label={link.label} />;
  }

  if (link.id === "cart") {
    return (
      <span data-header-nav-id={link.id}>
        <CartLink href={link.href} iconOnly label={link.label} />
      </span>
    );
  }

  if (link.id === "wishlist") {
    return <WishlistLink label={link.label} />;
  }

  if (link.id === "account") {
    return <AccountLink label={link.label} />;
  }

  const Icon = Search;

  return (
    <Link aria-label={link.label} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10 hover:text-red" data-header-nav-id={link.id} href={link.href}>
      <Icon aria-hidden="true" size={24} />
      <span className="sr-only">{link.label}</span>
    </Link>
  );
}
