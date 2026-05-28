/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  // Prevent MIME-type sniffing (e.g. serving a JS file as text/html)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block the page from being embedded in iframes (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Only send the origin as referrer for cross-origin requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features the app doesn't use
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  },
  // Force HTTPS for 1 year with preload (only meaningful in production behind TLS)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Prevent this page from being used as a popup opener — mitigates tab-napping
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Prevent this page from loading cross-origin resources unless they explicitly opt-in
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Content Security Policy.
  // Dev mode needs 'unsafe-eval' (webpack source maps) and ws: (HMR websocket).
  // Production uses a tighter policy without those.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
      "frame-ancestors 'none'",
      // Blocks Flash/plugins — no plugin content is used
      "object-src 'none'",
      // Prevents <base> tag injection which could redirect relative URLs
      "base-uri 'self'",
      // Forms may only submit to same origin
      "form-action 'self'",
      // Instruct browsers to upgrade any http:// sub-resources to https://
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; "),
  },
];

const nextConfig = {
  // Remove the X-Powered-By: Next.js header (no need to advertise the stack)
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
