const legacyRedirects = [
  ["/read/65/toys", "/toys"],
  ["/read/47/party-supplies", "/party-supplies"],
  ["/read/48/stationery", "/stationery"],
  ["/read/49/arts-crafts", "/arts-and-crafts"],
  ["/read/50/greeting-cards", "/greeting-cards"],
  ["/read/63/balloons", "/balloons"],
  ["/read/51/gifts", "/gifts"],
  ["/read/58/seasonal-specials", "/holidays"],
  ["/read/20/modern-state-news-store-locations-in-upper-east-side-nyc", "/locations"],
  ["/read/59/store-on-3rd-avenue", "/locations/3rd-avenue"],
  ["/read/60/store-on-86th-street", "/locations/86th-street"],
  ["/read/19/a-modern-state-news", "/about"],
  ["/read/64/email-signup", "/contact#newsletter"]
];

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  process.env.NODE_ENV === "development" ? "'unsafe-eval'" : "",
  "https://web.squarecdn.com",
  "https://sandbox.web.squarecdn.com"
].filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return legacyRedirects.map(([source, destination]) => ({
      source,
      destination,
      permanent: true
    }));
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
