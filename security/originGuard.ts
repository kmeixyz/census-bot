// security/originGuard.ts
// Same-origin guard for /api/* routes. Runs on the Edge runtime (invoked from
// the root middleware.ts, which Next.js requires to live at the project root).
// Blocks cross-origin fetch/XHR from third-party sites so the API — which spends
// ANTHROPIC_API_KEY / CENSUS_API_KEY quota — can't be called from other origins.

import { NextRequest, NextResponse } from "next/server";

// These are set at build time or by the hosting platform.
const ALLOWED_ORIGINS = new Set(
  [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    // Always allow localhost in development
    process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined,
    process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : undefined,
  ].filter(Boolean) as string[]
);

export function originGuard(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // Requests with no Origin header come from same-origin navigations, server-to-server
  // calls, or tools — allow them through.
  if (!origin) {
    return NextResponse.next();
  }

  // Build a URL from origin to extract just the hostname for comparison.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Malformed Origin header — block it.
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Allow if origin matches the request host (same-origin) …
  const isSameOrigin = host && originHost === host;
  // … or if origin is in the explicit allowlist (e.g. Vercel preview URLs).
  const isAllowed = isSameOrigin || ALLOWED_ORIGINS.has(origin);

  if (!isAllowed) {
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const res = NextResponse.next();
  // Echo back the allowed origin so same-origin fetch calls get a valid CORS response.
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Vary", "Origin");
  return res;
}
