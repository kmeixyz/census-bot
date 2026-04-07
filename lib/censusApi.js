// lib/censusApi.js
// Handles constructing requests to the Census ACS 5-year API

const BASE_URL = "https://api.census.gov/data/2022/acs/acs5";

/**
 * Fetches a single ACS variable for a given geography.
 *
 * @param {string} variableId   - Census variable code e.g. "B19013_001E"
 * @param {object} geoParams    - { forGeo, inGeo?, placeFilter? }
 * @param {string} apiKey       - Census API key (server-side only)
 * @returns {string|null}       - Raw string value or null
 */
export async function fetchCensusValue(variableId, geoParams, apiKey) {
  const { forGeo, inGeo, placeFilter } = geoParams;

  // Build URL
  const params = new URLSearchParams({
    get: `NAME,${variableId}`,
    for: forGeo,
    key: apiKey,
  });
  if (inGeo) params.set("in", inGeo);

  const url = `${BASE_URL}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Census API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  // data[0] = headers, data[1..] = rows
  if (!data || data.length < 2) {
    throw new Error("No data returned from Census API.");
  }

  // If we need to filter by place name (city query)
  if (placeFilter) {
    const nameIdx = 0; // NAME is first column
    const valIdx = 1;  // requested variable is second

    const filter = placeFilter.toLowerCase();
    const match = data.slice(1).find(row => row[nameIdx].toLowerCase().includes(filter));

    if (!match) {
      throw new Error(`Couldn't find "${placeFilter}" in Census place data. The city name may be slightly different — try spelling it out fully.`);
    }

    return match[valIdx];
  }

  // State-level or first result
  return data[1][1];
}
