"use client";

import { StorefrontRouteError } from "@/components/storefront/storefront-route-error";

export default function ToysError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StorefrontRouteError reset={reset} title="Toys are temporarily unavailable." />;
}
