import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  serverExternalPackages: ["heic-decode", "libheif-js"],
  experimental: {
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
    optimizePackageImports: ["lucide-react", "radix-ui"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
