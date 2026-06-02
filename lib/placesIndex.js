// lib/placesIndex.js
// Loads acs-data/places.json once at cold start and exposes synchronous
// name-based lookups. All API fetching was moved to scripts/fetch-places.mjs.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA_PATH = resolve(process.cwd(), "acs-data/places.json");

function expandPlace(r) {
  return {
    geoType: "place",
    placeKind: r.k,
    placeType: r.pt,
    name: r.n,
    stateName: r.sn,
    stateFips: r.sf,
    placeFips: r.pf,
    population: r.pop,
    rank: r.r,
  };
}

function expandCounty(r) {
  return {
    geoType: "county",
    countyType: r.ct,
    name: r.n,
    stateName: r.sn,
    stateFips: r.sf,
    countyFips: r.cf,
    population: r.pop,
  };
}

function expandSubdivision(r) {
  return {
    geoType: "county_subdivision",
    subdivType: r.st,
    name: r.n,
    stateName: r.sn,
    stateFips: r.sf,
    countyFips: r.cf,
    subdivFips: r.svf,
    population: r.pop,
  };
}

function expandCbsa(r) {
  return {
    geoType: "cbsa",
    cbsaType: r.ct,
    name: r.n,
    principalCities: r.pc,
    stateAbbrs: r.sa,
    fullName: r.fn,
    cbsaFips: r.cbf,
    population: r.pop,
  };
}

function expandUrbanArea(r) {
  return {
    geoType: "urban_area",
    name: r.n,
    principalCities: r.pc,
    stateAbbrs: r.sa,
    fullName: r.fn,
    uaFips: r.uaf,
    population: r.pop,
  };
}

function buildIndex() {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));

  const placesByName = new Map();
  for (const r of raw.places) {
    const key = r.n.toLowerCase();
    if (!placesByName.has(key)) placesByName.set(key, []);
    placesByName.get(key).push(expandPlace(r));
  }

  const countiesByName = new Map();
  // Also accumulate per-state population from counties for the state index.
  const statePopByFips = new Map();
  const stateNameByFips = new Map();
  for (const r of raw.counties) {
    const key = r.n.toLowerCase();
    if (!countiesByName.has(key)) countiesByName.set(key, []);
    countiesByName.get(key).push(expandCounty(r));
    statePopByFips.set(r.sf, (statePopByFips.get(r.sf) ?? 0) + (r.pop ?? 0));
    if (!stateNameByFips.has(r.sf)) stateNameByFips.set(r.sf, r.sn);
  }

  // statesByName: full state name (lowercased) → state candidate object.
  const statesByName = new Map();
  for (const [fips, stateName] of stateNameByFips.entries()) {
    const key = stateName.toLowerCase();
    statesByName.set(key, {
      geoType: "state",
      name: stateName,
      stateName,
      stateFips: fips,
      population: statePopByFips.get(fips) ?? 0,
    });
  }

  const subdivsByName = new Map();
  for (const r of raw.subdivisions) {
    const key = r.n.toLowerCase();
    if (!subdivsByName.has(key)) subdivsByName.set(key, []);
    subdivsByName.get(key).push(expandSubdivision(r));
  }

  const cbsasByPrincipal = new Map();
  for (const r of raw.cbsas) {
    const expanded = expandCbsa(r);
    for (const city of r.pc) {
      const key = city.toLowerCase();
      if (!cbsasByPrincipal.has(key)) cbsasByPrincipal.set(key, []);
      cbsasByPrincipal.get(key).push(expanded);
    }
  }

  const urbanByPrincipal = new Map();
  for (const r of raw.urbanAreas) {
    const expanded = expandUrbanArea(r);
    for (const city of r.pc) {
      const key = city.toLowerCase();
      if (!urbanByPrincipal.has(key)) urbanByPrincipal.set(key, []);
      urbanByPrincipal.get(key).push(expanded);
    }
  }

  return { placesByName, countiesByName, subdivsByName, cbsasByPrincipal, urbanByPrincipal, statesByName };
}

let _index = null;
function getIndex() {
  if (!_index) _index = buildIndex();
  return _index;
}

export function lookupStateByName(name) {
  const { statesByName } = getIndex();
  return statesByName.get(name.toLowerCase()) ?? null;
}

export function lookupPlacesByName(names, stateFipsSet) {
  const { placesByName } = getIndex();
  const results = [];
  for (const name of names) {
    for (const r of placesByName.get(name) ?? []) {
      if (!stateFipsSet || stateFipsSet.has(r.stateFips)) results.push(r);
    }
  }
  return results;
}

export function lookupCountiesByName(names, stateFipsSet) {
  const { countiesByName } = getIndex();
  const results = [];
  for (const name of names) {
    for (const r of countiesByName.get(name) ?? []) {
      if (!stateFipsSet || stateFipsSet.has(r.stateFips)) results.push(r);
    }
  }
  return results;
}

export function lookupSubdivsByName(names, stateFipsSet) {
  const { subdivsByName } = getIndex();
  const results = [];
  for (const name of names) {
    for (const r of subdivsByName.get(name) ?? []) {
      if (!stateFipsSet || stateFipsSet.has(r.stateFips)) results.push(r);
    }
  }
  return results;
}

export function lookupCbsasByPrincipal(name, stateAbbrSet) {
  const { cbsasByPrincipal } = getIndex();
  const rows = cbsasByPrincipal.get(name) ?? [];
  if (!stateAbbrSet || stateAbbrSet.size === 0) return rows;
  return rows.filter(r =>
    r.stateAbbrs.split("-").some(s => stateAbbrSet.has(s.trim().toUpperCase()))
  );
}

export function lookupUrbanByPrincipal(name, stateAbbrSet) {
  const { urbanByPrincipal } = getIndex();
  const rows = urbanByPrincipal.get(name) ?? [];
  if (!stateAbbrSet || stateAbbrSet.size === 0) return rows;
  return rows.filter(r =>
    r.stateAbbrs.split(/--|-/).some(s => stateAbbrSet.has(s.trim().toUpperCase()))
  );
}
