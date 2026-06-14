import type { NextConfig } from "next";

// Content-Security-Policy.
//
// Why these values:
//  - script-src keeps 'unsafe-inline'/'unsafe-eval' because Next's
//    hydration/runtime injects inline bootstrap scripts (no nonce
//    pipeline here) — but 'self' still blocks cross-origin <script src>
//    injection, which is the most common XSS delivery vector.
//  - connect-src allows https:/wss: so Supabase REST + Realtime
//    websockets work; default-src 'self' would otherwise sever them.
//  - object-src 'none' + base-uri 'self' + frame-ancestors 'self' are
//    pure hardening with no functional cost.
//  - frame-src allows blob:/data: so the AI Build Studio's sandboxed
//    srcdoc preview iframe can load.
const baseCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https: wss:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "form-action 'self' https:",
];

// Build Studio carve-out: the studio renders user-authored HTML/JS in a
// sandboxed srcdoc iframe (opaque origin — parent CSP can't reach inside
// it). We relax frame-src to be fully permissive here so the preview is
// never blocked, and keep this route isolated from any future tightening
// of the global script policy (e.g. a move to nonces).
const buildCsp = baseCsp.map((d) =>
  d.startsWith("frame-src") ? "frame-src 'self' blob: data: https:" : d,
);

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // General policy first; the more specific Build Studio block comes
      // last so its Content-Security-Policy wins for /studio/build/*
      // (Next applies all matching blocks, last-write-wins per header key).
      {
        source: "/(.*)",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: baseCsp.join("; ") }],
      },
      {
        source: "/studio/build/:path*",
        headers: [{ key: "Content-Security-Policy", value: buildCsp.join("; ") }],
      },
    ];
  },
};

export default nextConfig;
