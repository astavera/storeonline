/*
STORE AREA: Storefront
SECTION: Global Header
SECTION ID: layout.header
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Public navigation order and utility links.
SAFE TO EDIT: Navigation labels and token-based styling.
DO NOT EDIT HERE: Department business rules, Square category mappings, auth, or cart totals.
RELATED FILES: src/config/navigation.config.ts, src/config/storefront.config.ts
BUSINESS LOGIC FILES: src/features/departments/services/department-service.ts
*/

import { Heart, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { defaultHeaderNavigation, type HeaderNavigationConfig, type HeaderNavigationLink } from "@/config/header-navigation.config";
import { CartLink } from "./cart-link";
import { MobileSiteNavigation } from "./mobile-site-navigation";

export function SiteHeader({ navigation = defaultHeaderNavigation }: { navigation?: HeaderNavigationConfig }) {
  const primaryLinks = navigation.primary.filter((link) => link.visible);
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
      <div className="bg-[#367DCB] text-white">
        <div className="mx-auto flex min-h-[72px] w-full items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-8 lg:gap-8 xl:px-12 2xl:px-16">
          <MobileSiteNavigation mobileCta={navigation.mobileCta} primaryLinks={primaryLinks} utilityLinks={drawerUtilityLinks} />
          <Link className="hidden min-w-0 flex-1 items-center sm:flex lg:min-w-[220px] lg:flex-none" data-header-logo href="/">
            <img alt="Modern State" className="h-12 w-auto max-w-[175px] object-contain sm:h-14 sm:max-w-[230px]" decoding="async" src="/images/modern-state-logo-original.png" />
            <span className="sr-only">Modern State - Toys, party, balloons and gifts</span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden flex-1 items-center gap-8 text-[15px] font-bold leading-none xl:flex">
            {primaryLinks.map((link) => (
              <Link className="hover:text-yellow" data-header-nav-id={link.id} href={link.href} key={link.id}>
                {link.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Utility navigation" className="hidden items-center gap-2 text-[15px] font-semibold xl:flex">
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
    </header>
  );
}

function HeaderUtilityLink({ link }: { link: HeaderNavigationLink }) {
  if (link.id === "cart") {
    return (
      <span data-header-nav-id={link.id}>
        <CartLink href={link.href} iconOnly label={link.label} />
      </span>
    );
  }

  const Icon = link.id === "account" ? UserRound : link.id === "wishlist" ? Heart : Search;

  return (
    <Link aria-label={link.label} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10 hover:text-yellow" data-header-nav-id={link.id} href={link.href}>
      <Icon aria-hidden="true" size={24} />
      <span className="sr-only">{link.label}</span>
    </Link>
  );
}
