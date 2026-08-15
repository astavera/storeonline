"use client";

import { StorefrontRouteError } from "@/components/storefront/storefront-route-error";

export default function HolidaysError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StorefrontRouteError reset={reset} title="Holidays are temporarily unavailable." />;
}
