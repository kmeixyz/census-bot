// pages/api/acs-passage.js — fetch a single chunk plus its neighbors for the
// /learn/passage/[chunkId] viewer.
//
// GET ?id=<chunk_id> → { doc, focal, prev, next }

import { getPassageWithContext } from "../../lib/acsRag";
import { makeRateLimiter } from "../../lib/rateLimit";

const acsPassageRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 60 });

export default async function handler(req, res) {
  const rl = acsPassageRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ error: "Missing 'id' query param." });

    const passage = await getPassageWithContext(id);
    if (!passage) return res.status(404).json({ error: "Chunk not found." });
    return res.status(200).json(passage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const missingIndex = /index not found/i.test(msg);
    return res.status(missingIndex ? 503 : 500).json({
      error: missingIndex ? "ACS documentation index has not been built yet." : "Failed to retrieve passage.",
      code: missingIndex ? "INDEX_NOT_BUILT" : "INTERNAL",
    });
  }
}
