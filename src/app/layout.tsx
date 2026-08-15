/**
 * Defines the shared layout and providers for the storefront homepage route area.
 */

import type { Metadata } from "next";
import { storefrontIsIndexable } from "@/lib/seo/storefront-seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Modern State - State News NYC",
    template: "%s | Modern State - State News NYC"
  },
  description: "A modern ecommerce storefront for Modern State - State News NYC on the Upper East Side.",
  openGraph: {
    type: "website",
    siteName: "Modern State - State News NYC"
  },
  robots: {
    index: storefrontIsIndexable(),
    follow: storefrontIsIndexable()
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
