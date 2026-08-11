/** Opens the customer account experience without leaving the current page. */

"use client";

import { UserRound } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isAccountPanelOpen, setAccountPanelOpen, subscribeToAccountPanel } from "@/components/customers/account-store";
import { setWishlistPanelOpen } from "@/components/commerce/wishlist-store";

export function AccountLink({ label = "Account" }: { label?: string }) {
  const open = useSyncExternalStore(subscribeToAccountPanel, isAccountPanelOpen, () => false);

  return (
    <button
      aria-controls="storefront-account-drawer"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full text-current transition hover:bg-black/5 hover:text-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
      data-header-nav-id="account"
      onClick={() => {
        setWishlistPanelOpen(false);
        setAccountPanelOpen(true);
      }}
      type="button"
    >
      <UserRound aria-hidden="true" size={24} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
