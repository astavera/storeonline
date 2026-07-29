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

import { Heart, Search, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { defaultHeaderNavigation, type HeaderNavigationConfig, type HeaderNavigationLink } from "@/config/header-navigation.config";
import { CartLink } from "./cart-link";
import { HeaderCatalogSearch } from "./header-catalog-search";
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
      <div className="bg-[#FFFFFF] text-black">
        <div className="mx-auto flex min-h-[64px] w-full items-center justify-between gap-1 px-3 py-2 sm:min-h-[72px] sm:gap-6 sm:px-8 sm:py-3 lg:gap-8 xl:px-12 2xl:px-16">
          <MobileSiteNavigation mobileCta={navigation.mobileCta} primaryLinks={primaryLinks} utilityLinks={drawerUtilityLinks} />
          <Link className="flex min-w-0 flex-1 items-center justify-center sm:justify-start lg:min-w-[220px] lg:flex-none" data-header-logo href="/">
            <Image alt="Modern State" className="h-9 w-auto max-w-[108px] object-contain sm:h-14 sm:max-w-[230px]" height={56} priority src="/images/modern-state-logo-original.png" width={230} />
            <span className="sr-only">Modern State - Toys, party, balloons and gifts</span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden flex-1 items-center gap-8 text-[15px] font-bold leading-none xl:flex">
            {primaryLinks.map((link) => (
              <Link className="hover:text-yellow" data-header-nav-id={link.id} href={link.href} key={link.id}>
                {link.label}
              </Link>
            ))}
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

  const Icon = link.id === "account" ? UserRound : link.id === "wishlist" ? Heart : Search;

  return (
    <Link aria-label={link.label} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10 hover:text-red" data-header-nav-id={link.id} href={link.href}>
      <Icon aria-hidden="true" size={24} />
      <span className="sr-only">{link.label}</span>
    </Link>
  );
}
