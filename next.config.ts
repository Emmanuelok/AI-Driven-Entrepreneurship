import type { NextConfig } from "next";

// Security headers applied to every route. A global CSP is intentionally
// not set yet: the Build Studio renders user-authored HTML/JS in sandboxed
// iframes and a strict blanket policy would break it — adding one needs a
// per-route carve-out, not a global rule.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
