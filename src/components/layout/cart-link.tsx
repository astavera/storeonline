"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { readCartItems } from "@/components/commerce/add-to-cart-button";
import { cn } from "@/lib/utils";

export function CartLink({ href = "/cart", iconOnly = false, label = "Cart" }: { href?: string; iconOnly?: boolean; label?: string }) {
  const [quantity, setQuantity] = useState(0);

  useEffect(() => {
    function refreshQuantity() {
      setQuantity(readCartItems().reduce((total, item) => total + item.quantity, 0));
    }

    refreshQuantity();
    window.addEventListener("modern-state-cart-updated", refreshQuantity);
    window.addEventListener("storage", refreshQuantity);

    return () => {
      window.removeEventListener("modern-state-cart-updated", refreshQuantity);
      window.removeEventListener("storage", refreshQuantity);
    };
  }, []);

  return (
    <Link
      aria-label={label}
      className={cn(
        "relative inline-flex items-center text-current transition hover:bg-white/10 hover:text-yellow",
        iconOnly ? "h-10 w-10 justify-center rounded-full" : "gap-1 rounded-md border border-current/30 px-3 py-2 text-sm font-bold"
      )}
      href={href}
    >
      <ShoppingCart aria-hidden="true" size={iconOnly ? 24 : 16} />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
      {quantity > 0 ? (
        <span className={cn("rounded-pill bg-[var(--theme-action)] px-2 py-0.5 text-xs text-[var(--theme-action-foreground)]", iconOnly ? "absolute -right-1 -top-1" : "ml-2")}>{quantity}</span>
      ) : null}
    </Link>
  );
}
