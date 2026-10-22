import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * NOTE: framing headers (X-Frame-Options / frame-ancestors) are intentionally
 * omitted so the demo can be embedded by the review/preview environment.
 * Add them before a public production launch if embedding is not required.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
