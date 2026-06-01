// pages/api/trend.js
// Thin HTTP wrapper over lib/trend.js:runTrend. Accepts either:
//   { location: "California" | "Cook County, IL" | "zip 90210" | "Austin, Texas" }
//   { city, state }   (back-compat for the explore wizard)
//
// Variable identification — pick ONE:
//   • { metric: "median rent" }                  curated metrics from VARIABLE_MAP
//   • { variable_id, label, unit, table_id }     free-form — any ACS variable
//   • { share_of_variable_id }                   optional, divides the numerator
//                                                 by this denominator and returns
//                                                 percent (works with either form)
//
// Returns { points: [{year, numericValue, warning?}], locationLabel, ... } so
// callers can render legends + source-trail rows with the canonical resolved
// geography without re-doing geo resolution client-side.
//
// The chat route calls runTrend() directly (in-process) — see lib/trend.js —
// so it never pays a self-HTTP round-trip through this handler.

export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };

import { runTrend } from "../../lib/trend";
import { makeRateLimiter } from "../../lib/rateLimit";

// 30 requests per minute per IP — each trend call fans out to up to 10 Census API calls.
const trendRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 30 });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = trendRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  const { status, body } = await runTrend(req.body ?? {});
  return res.status(status).json(body);
}
