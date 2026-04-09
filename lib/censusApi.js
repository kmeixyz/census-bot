// lib/censusApi.js
const BASE_URL_BASE = "https://api.census.gov/data";
const DEFAULT_YEAR = "2022";

export async function fetchCensusValue(variableId, geoParams, apiKey, year = DEFAULT_YEAR) {
  const { forGeo, inGeo, placeFilter } = geoParams;

  const params = new URLSearchParams({
    get: `NAME,${variableId}`,
    for: forGeo,
    key: apiKey,
  });
  if (inGeo) params.set("in", inGeo);

  const url = `${BASE_URL_BASE}/${year}/acs/acs5?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Census API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data || data.length < 2) throw new Error("No data returned from Census API.");

  if (placeFilter) {
    const filter = placeFilter.toLowerCase();
    const match = data.slice(1).find(row => row[0].toLowerCase().includes(filter));
    if (!match) throw new Error(`Couldn't find "${placeFilter}" in Census place data.`);
    return match[1];
  }

  return data[1][1];
}

// NEW: fetch the same metric across 5 years
export async function fetchCensusOverTime(variableId, geoParams, apiKey) {
  const years = ["2018", "2019", "2020", "2021", "2022"];

  const results = await Promise.allSettled(
    years.map(year => fetchCensusValue(variableId, geoParams, apiKey, year))
  );

  return years.map((year, i) => ({
    year: parseInt(year),
    rawValue: results[i].status === "fulfilled" ? results[i].value : null,
  }));
}