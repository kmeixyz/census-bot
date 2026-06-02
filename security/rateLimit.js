// security/rateLimit.js
// Simple in-memory rate limiter for Next.js API routes.
//
// Usage:
//   import { makeRateLimiter } from "../../security/rateLimit";
//   const limiter = makeRateLimiter({ windowMs: 60_000, max: 20 });
//
//   export default async function handler(req, res) {
//     const result = limiter(req);
//     if (!result.ok) return res.status(429).json({ error: "Too many requests.", retryAfter: result.retryAfter });
//     ...
//   }
//
// Note: state is per-process. On serverless platforms (Vercel) each cold-start
// gets a fresh counter, but the limit still provides meaningful protection
// within a warm instance's lifetime.

// Prune stale entries periodically so Maps don't grow forever in
// long-lived server processes (e.g. `next start`).
const PRUNE_INTERVAL_MS = 5 * 60 * 1000; // 5 min

/**
 * Extract a best-effort client IP from a Next.js request object.
 * Trusts x-forwarded-for only if present (set by Vercel / reverse proxies).
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; first entry is the client.
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Returns a rate-limiter function for a given window/max pair.
 * Each limiter instance has its own independent store so limits are
 * per-route, not shared across routes.
 * Call the returned function once per request; it returns { ok, retryAfter }.
 *
 * @param {{ windowMs: number, max: number }} opts
 */
export function makeRateLimiter({ windowMs, max }) {
  // Each limiter gets its own Map so different routes don't share counters.
  const store = new Map(); // ip → { count, resetAt }
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, PRUNE_INTERVAL_MS).unref();

  return function check(req) {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = store.get(ip);
    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { ok: false, retryAfter };
    }
    entry.count += 1;
    return { ok: true };
  };
}
