
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  outputFileTracingIncludes: {
    "/api/audit": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/playwright-core/**/*",
      "./node_modules/playwright/**/*",
    ],
  },
};

export default nextConfig;
