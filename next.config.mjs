/**
 * Configures Next.js security headers, redirects, build behavior, and runtime settings.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import oldUrlRedirects from "./src/config/old-url-redirects.config.json" with { type: "json" };

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  process.env.NODE_ENV === "development" ? "'unsafe-eval'" : "",
  "https://web.squarecdn.com",
  "https://sandbox.web.squarecdn.com"
].filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  outputFileTracingIncludes: {
    "/*": ["./prisma/prod-ca-2021.crt"]
  },
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: projectRoot
  },
  async redirects() {
    return [
      {
        source: "/uploads/admin/20260710113045-home-hero-back-to-school-ecommerce-wireframe.svg",
        destination: "/images/homepage/home-hero-back-to-school-ecommerce-wireframe.svg",
        permanent: true
      },
      ...oldUrlRedirects.map(({ source, destination, permanent }) => ({
        source,
        destination,
        permanent
      }))
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc.join(" ")}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://connect.squareup.com https://connect.squareupsandbox.com https://api.mapbox.com https://events.mapbox.com",
              "frame-src 'self' https://web.squarecdn.com https://sandbox.web.squarecdn.com",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'"
            ].join("; ")
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
