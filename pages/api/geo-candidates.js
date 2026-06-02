// pages/api/geo-candidates.js
// Returns geography candidates matching a name, across place / county /
// county subdivision / CBSA / urban area. Used by the chatbot clarification
// flow to ask the user which scope they meant.

import { findGeoCandidates, findZctaByZip, describeCandidate } from "../../lib/geoCandidates";
import { makeRateLimiter } from "../../security/rateLimit";

const geoCandidatesRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 60 });

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rl = geoCandidatesRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  const name = String(req.query.name || "").trim().slice(0, 100);
  const state = req.query.state ? String(req.query.state).trim().slice(0, 50) : null;
  const zip = req.query.zip ? String(req.query.zip).trim().slice(0, 10) : null;

  if (zip) {
    try {
      const z = await findZctaByZip(zip);
      if (!z) return res.status(404).json({ error: "No ZCTA found for that ZIP code." });
      return res.status(200).json({ candidates: [{ ...z, ...describeCandidate(z) }] });
    } catch {
      return res.status(500).json({ error: "ZCTA lookup failed. Please try again." });
    }
  }

  if (!name) return res.status(400).json({ error: "Missing required query param: name (or zip)." });

  try {
    const candidates = await findGeoCandidates(name, { stateName: state });
    return res.status(200).json({
      candidates: candidates.map((c) => ({ ...c, ...describeCandidate(c) })),
      count: candidates.length,
    });
  } catch {
    return res.status(500).json({ error: "Geography lookup failed. Please try again." });
  }
}
