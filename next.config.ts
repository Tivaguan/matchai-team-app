import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // While developing, let a phone on the same Wi-Fi open the app at the Mac's
  // address (http://192.168.x.x:3000). Has no effect on the deployed app.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Every screen is a client page behind a login check, so there is nothing
    // for the automatic "instant navigation" checks to validate. Only check
    // segments that ask for it.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Always fetch the newest service worker, so updates reach devices.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
