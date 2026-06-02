// pages/api/acs-search.js — search endpoint for the /learn UI.

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };
// POST { query, topK? } → { results, total_chunks }
// GET  ?action=docs    → { docs: [...] }     (used to render the doc directory)

import { searchAcsDocs, getDocList } from "../../lib/acsRag";
import { makeRateLimiter } from "../../security/rateLimit";

const acsSearchRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 30 });

export default async function handler(req, res) {
  const rl = acsSearchRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  try {
    if (req.method === "GET" && req.query.action === "docs") {
      const docs = await getDocList();
      return res.status(200).json({ docs });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = Number.isFinite(body.topK) ? Math.min(20, Math.max(1, body.topK)) : 5;

    if (!query) {
      return res.status(400).json({ error: "Missing or empty 'query'." });
    }

    const out = await searchAcsDocs(query, { topK });
    return res.status(200).json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const missingIndex = /index not found/i.test(msg);
    return res.status(missingIndex ? 503 : 500).json({
      error: missingIndex ? "ACS documentation index has not been built yet." : "Search failed. Please try again.",
      code: missingIndex ? "INDEX_NOT_BUILT" : "INTERNAL",
    });
  }
}
