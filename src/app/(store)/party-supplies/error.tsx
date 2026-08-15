"use client";

import { StorefrontRouteError } from "@/components/storefront/storefront-route-error";

export default function PartySuppliesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StorefrontRouteError reset={reset} title="Party Supplies are temporarily unavailable." />;
}
