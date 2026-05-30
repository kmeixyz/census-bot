// lib/geoCandidates.js
// Server-side helper: find ACS geography candidates matching a free-text name.
// Searches across place, county, county subdivision, CBSA, and urban area —
// the geographies a user might type by name. Tract / block group / PUMA are
// id-based, not name-based, so they're not searched here.

import { STATE_FIPS, findLocationSeparator } from "./censusTranslator";
import { CURRENT_ACS_YEAR } from "./censusConstants";
import {
  lookupPlacesByName,
  lookupCountiesByName,
  lookupSubdivsByName,
  lookupCbsasByPrincipal,
  lookupUrbanByPrincipal,
} from "./placesIndex";

// Known place-name mismatches between user expectations and the bare name
// the Census Bureau publishes. Each key maps a colloquial name (lowercased)
// to one or more synonyms — we match against any of them in addition to the
// literal target.
const PLACE_NAME_ALIASES = {
  "honolulu":     ["urban honolulu"],            // CDP is "Urban Honolulu CDP"
  "saint louis":  ["st. louis"],                 // Census uses "St."
  "saint paul":   ["st. paul"],
  "saint petersburg": ["st. petersburg"],
};

// FIPS → 2-letter postal abbreviation (for CBSA/urban area state filtering)
const FIPS_TO_ABBR = Object.fromEntries(
  Object.entries(STATE_FIPS)
    .filter(([k]) => k.length === 2)
    .map(([k, v]) => [v, k.toUpperCase()])
);

const ALL_STATE_FIPS = [...new Set(
  Object.entries(STATE_FIPS).filter(([k]) => k.length > 2).map(([, v]) => v)
)];

/**
 * Find geography candidates matching a name. Searches synchronously against
 * the pre-built places index (acs-data/places.json).
 *
 * @param {string} name - bare name like "Bozeman", "Gallatin", "Springfield"
 * @param {object} opts
 * @param {string} [opts.stateName] - restrict to one state (full name or postal abbr)
 * @returns {Promise<Array>} ranked candidate list
 */
export async function findGeoCandidates(name, { stateName = null } = {}) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return [];

  // If a stateName was given but isn't in STATE_FIPS, fall back to a nationwide
  // search rather than returning zero per-state candidates.
  const stateFipsList = (() => {
    if (!stateName) return ALL_STATE_FIPS;
    const fips = STATE_FIPS[String(stateName).trim().toLowerCase()];
    return fips ? [fips] : ALL_STATE_FIPS;
  })();

  const isFiltered = stateFipsList.length < ALL_STATE_FIPS.length;
  const stateFipsSet = isFiltered ? new Set(stateFipsList) : null;
  const stateAbbrSet = isFiltered
    ? new Set(stateFipsList.map(f => FIPS_TO_ABBR[f]).filter(Boolean))
    : null;

  // Build the set of accepted name-equivalents for this target (literal + aliases).
  const targetNames = [target, ...(PLACE_NAME_ALIASES[target] || [])];

  const places = lookupPlacesByName(targetNames, stateFipsSet);
  const counties = lookupCountiesByName(targetNames, stateFipsSet);
  const subdivisions = lookupSubdivsByName(targetNames, stateFipsSet);
  const cbsas = lookupCbsasByPrincipal(target, stateAbbrSet);
  const urbanAreas = lookupUrbanByPrincipal(target, stateAbbrSet);

  // Dedupe places per (state, name) — prefer lower rank (city > town > cdp, etc.)
  const dedupedPlaces = (() => {
    const byKey = new Map();
    for (const p of places) {
      const key = `${p.stateFips}::${p.name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || p.rank < existing.rank) byKey.set(key, p);
    }
    return [...byKey.values()];
  })();

  const merged = [...dedupedPlaces, ...counties, ...cbsas, ...urbanAreas, ...subdivisions];

  // Sort by population-weighted score. Places get a 5× boost so the intended
  // city ranks above a same-name metro; subdivisions get 0.2× because they're
  // rarely the intended target. Large metros still float above tiny villages.
  const TYPE_BOOST = { place: 5, county: 2, cbsa: 1, urban_area: 1, county_subdivision: 0.2 };
  merged.sort((a, b) => {
    const sa = (a.population ?? 0) * (TYPE_BOOST[a.geoType] ?? 1);
    const sb = (b.population ?? 0) * (TYPE_BOOST[b.geoType] ?? 1);
    return sb - sa;
  });

  return merged;
}

/**
 * Resolve a 5-digit ZIP code to a ZCTA candidate (population, name).
 * ZCTAs are nationwide; we hit the ZCTA endpoint directly.
 */
export async function findZctaByZip(zip) {
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) throw new Error("Missing CENSUS_API_KEY.");
  const cleaned = String(zip || "").trim();
  if (!/^\d{5}$/.test(cleaned)) return null;
  try {
    const url = `https://api.census.gov/data/${CURRENT_ACS_YEAR}/acs/acs5?get=NAME,B01003_001E&for=zip%20code%20tabulation%20area:${cleaned}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    const row = data[1];
    const n = Number(row[1]);
    return {
      geoType: "zcta",
      name: cleaned,
      fullName: String(row[0] || ""),
      population: Number.isFinite(n) && n >= 0 ? n : null,
    };
  } catch {
    return null;
  }
}

/**
 * Extract a candidate "place phrase" from a free-text query.
 * "median income in Bozeman" → { name: "Bozeman", state: null }
 * "median income in Springfield, IL" → { name: "Springfield", state: "IL" }
 */
export function extractGeoPhrase(query) {
  const lower = String(query || "").toLowerCase();
  const sep = findLocationSeparator(lower);
  if (sep.index === -1) return null;
  const tail = String(query).slice(sep.index + sep.length).trim().replace(/[?.!]+$/, "");
  if (!tail) return null;
  if (tail.includes(",")) {
    const [name, state] = tail.split(",").map((s) => s.trim());
    return { name, state };
  }
  return { name: tail, state: null };
}

/**
 * Build Census API geo params (forGeo / inGeo) from a picked candidate.
 * Returned shape is compatible with fetchCensusValue() in lib/censusApi.js.
 */
export function geoParamsFromCandidate(c) {
  if (!c || typeof c !== "object") return null;
  switch (c.geoType) {
    case "place":
      if (!c.placeFips || !c.stateFips) return null;
      return {
        forGeo: `place:${c.placeFips}`,
        inGeo: `state:${c.stateFips}`,
      };
    case "county":
      if (!c.countyFips || !c.stateFips) return null;
      return {
        forGeo: `county:${c.countyFips}`,
        inGeo: `state:${c.stateFips}`,
      };
    case "cbsa":
      if (!c.cbsaFips) return null;
      return {
        forGeo: `metropolitan statistical area/micropolitan statistical area:${c.cbsaFips}`,
      };
    case "county_subdivision":
      if (!c.subdivFips || !c.countyFips || !c.stateFips) return null;
      return {
        forGeo: `county subdivision:${c.subdivFips}`,
        inGeo: `state:${c.stateFips} county:${c.countyFips}`,
      };
    case "urban_area":
      if (!c.uaFips) return null;
      return { forGeo: `urban area:${c.uaFips}` };
    case "zcta":
      if (!c.name) return null;
      return { forGeo: `zip code tabulation area:${c.name}` };
    case "state":
      if (!c.stateFips) return null;
      return { forGeo: `state:${c.stateFips}` };
    default:
      return null;
  }
}

/**
 * Human-readable label for a picked candidate (used in the answer sentence).
 */
export function candidateLabel(c) {
  switch (c.geoType) {
    case "place":
      return `${c.name}, ${c.stateName}`;
    case "county":
      return `${c.name} ${c.countyType === "county" ? "County" : c.countyType.replace(/\b\w/g, (x) => x.toUpperCase())}, ${c.stateName}`;
    case "county_subdivision":
      return `${c.name}${c.subdivType ? ` ${c.subdivType}` : ""}, ${c.stateName}`;
    case "cbsa":
      return c.fullName;
    case "urban_area":
      return c.fullName;
    case "zcta":
      return `ZIP ${c.name}`;
    default:
      return c.name || "Unknown";
  }
}

/**
 * Human-readable label + sublabel for a candidate, for use in UI chips.
 */
export function describeCandidate(c) {
  const fmtPop = (p) =>
    p == null ? "" : p >= 1_000_000 ? `${(p / 1_000_000).toFixed(1)}M` : p >= 1_000 ? `${(p / 1_000).toFixed(0)}K` : `${p}`;
  switch (c.geoType) {
    case "place":
      return {
        label: `${c.name}, ${c.stateName}`,
        sublabel: `${c.placeKind === "cdp" ? "CDP (unincorporated)" : "City"} · pop ${fmtPop(c.population)}`,
        icon: "",
      };
    case "county":
      return {
        label: `${c.name} ${c.countyType === "county" ? "County" : c.countyType.replace(/\b\w/g, (x) => x.toUpperCase())}, ${c.stateName}`,
        sublabel: `County · pop ${fmtPop(c.population)}`,
        icon: "",
      };
    case "county_subdivision":
      return {
        label: `${c.name}${c.subdivType ? ` ${c.subdivType}` : ""}, ${c.stateName}`,
        sublabel: `Township / county subdivision · pop ${fmtPop(c.population)}`,
        icon: "",
      };
    case "cbsa":
      return {
        label: c.fullName,
        sublabel: `${c.cbsaType === "metro" ? "Metropolitan" : "Micropolitan"} Statistical Area · pop ${fmtPop(c.population)}`,
        icon: "",
      };
    case "urban_area":
      return {
        label: c.fullName,
        sublabel: `Urban Area · pop ${fmtPop(c.population)}`,
        icon: "",
      };
    case "zcta":
      return {
        label: `ZIP ${c.name}`,
        sublabel: `ZIP Code Tabulation Area · pop ${fmtPop(c.population)}`,
        icon: "",
      };
    default:
      return { label: c.name || "Unknown", sublabel: "", icon: "" };
  }
}
