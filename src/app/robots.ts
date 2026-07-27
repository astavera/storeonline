import type { MetadataRoute } from "next";
import { absoluteStorefrontUrl, storefrontIsIndexable } from "@/lib/seo/storefront-seo";

export default function robots(): MetadataRoute.Robots {
  if (!storefrontIsIndexable()) {
    return {
      rules: { userAgent: "*", disallow: "/" },
      sitemap: absoluteStorefrontUrl("/sitemap.xml")
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/cart", "/checkout", "/order-confirmation/"]
    },
    sitemap: absoluteStorefrontUrl("/sitemap.xml"),
    host: absoluteStorefrontUrl("/")
  };
}
