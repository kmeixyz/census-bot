// GET /api/search-places?q=Chi&limit=15
// Prefix/contains search across Census places, counties, and selected county
// subdivisions (legally-defined MCDs like townships and towns, not statistical
// units like CCDs). Reads from the pre-built acs-data/places.json.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeRateLimiter } from "../../security/rateLimit";

const searchPlacesRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 60 });

const DATA_PATH = resolve(process.cwd(), "acs-data/places.json");

// States get 2× boost on their summed-county population (enough to float above
// same-name cities); places get 5× so a city beats a same-name metro/county;
// subdivisions get 0.3× because they're niche. Mirrors geoCandidates.js.
const TYPE_BOOST = { state: 2, place: 5, county: 2, county_subdivision: 0.3 };

const COUNTY_SUFFIX = {
  county: "County", parish: "Parish", borough: "Borough",
  "census area": "Census Area", municipio: "Municipio", municipality: "Municipality",
};

let _entries = null;
function getEntries() {
  if (_entries) return _entries;
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const all = [];

  // ── States ────────────────────────────────────────────────────────────────
  // Derive approximate state populations by summing county pops.
  const statePop = new Map();
  for (const r of raw.counties) {
    statePop.set(r.sn, (statePop.get(r.sn) ?? 0) + (r.pop ?? 0));
  }
  for (const [sn, pop] of statePop.entries()) {
    all.push({ name: sn, state: "", display: sn, geoType: "state", pop });
  }

  // ── Places ────────────────────────────────────────────────────────────────
  // Dedupe per (name, state): prefer the place with the lowest rank
  // (city=0 beats CDP=4) so "Denver, Colorado" appears once as a city.
  const placeBest = new Map();
  for (const r of raw.places) {
    const key = `${r.n.toLowerCase()}::${r.sn}`;
    const existing = placeBest.get(key);
    if (!existing || r.r < existing.r) placeBest.set(key, r);
  }
  const placeKeys = new Set(placeBest.keys());
  for (const r of placeBest.values()) {
    all.push({
      name: r.n,
      state: r.sn,
      display: `${r.n}, ${r.sn}`,
      geoType: "place",
      pop: r.pop ?? 0,
    });
  }

  // ── Counties ──────────────────────────────────────────────────────────────
  // Include the type suffix in name ("Denver County") so users can search for it.
  for (const r of raw.counties) {
    const suffix = COUNTY_SUFFIX[r.ct] ?? "County";
    const fullName = `${r.n} ${suffix}`;
    all.push({
      name: fullName,
      state: r.sn,
      display: `${fullName}, ${r.sn}`,
      geoType: "county",
      pop: r.pop ?? 0,
    });
  }

  // ── County subdivisions ───────────────────────────────────────────────────
  // Only legally-defined MCDs (townships, New England towns, etc.) — those with
  // a real subdivType. Exclude CCDs (r.st === null) which are statistical units
  // used in states like Colorado that don't have legally defined civil divisions.
  // Also drop any subdivision whose bare name already exists as a place in the
  // same state.
  for (const r of raw.subdivisions) {
    if (!r.st) continue; // skip CCDs and other statistical subdivisions
    const key = `${r.n.toLowerCase()}::${r.sn}`;
    if (placeKeys.has(key)) continue; // place entry takes precedence
    all.push({
      name: r.n,
      state: r.sn,
      display: `${r.n}, ${r.sn}`,
      geoType: "county_subdivision",
      pop: r.pop ?? 0,
    });
  }

  // Sort by population × type boost descending so the most significant
  // geography floats first within any starts-with or contains bucket.
  all.sort((a, b) => {
    const sb = b.pop * (TYPE_BOOST[b.geoType] ?? 1);
    const sa = a.pop * (TYPE_BOOST[a.geoType] ?? 1);
    return sb - sa;
  });

  _entries = all;
  return all;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rl = searchPlacesRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  const q = String(req.query.q || "").trim().slice(0, 100);
  if (q.length < 2) return res.status(200).json({ results: [] });

  const limit = parseInt(req.query.limit || "0", 10) || 15;

  try {
    const entries = getEntries();

    // Normalize: strip commas/punctuation and collapse whitespace so
    // "Austin TX", "Austin, TX", and "Austin Texas" all match the same entries.
    const normalize = (s) => s.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const ql = normalize(q);

    // Two buckets: name starts-with (preferred) then display contains.
    const starts = [];
    const contains = [];
    for (const p of entries) {
      const nl = normalize(p.name);
      const dl = normalize(p.display);
      if (nl.startsWith(ql)) starts.push(p);
      else if (dl.includes(ql)) contains.push(p);
      // Early exit once we have more than enough for both buckets.
      if (starts.length >= limit && contains.length >= limit) break;
    }

    const results = [...starts, ...contains].slice(0, limit);
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || "Search failed.") });
  }
}
