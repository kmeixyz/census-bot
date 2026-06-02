// pages/api/query.js
// Serverless API route — runs on Vercel, never exposed to the browser.
// The Census API key lives ONLY here via environment variables.

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

import { parseQuery, formatValue } from "../../lib/censusTranslator";
import { fetchCensusValueWithMOEAndFallback } from "../../lib/censusApi";
import { makeRateLimiter } from "../../lib/rateLimit";
import { computeRateIfNeeded } from "../../lib/censusRates";
import { CURRENT_ACS_YEAR } from "../../lib/censusConstants";
import { validateValue } from "../../lib/validateCensusData";

const queryRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 30 });

function buildSourceLabel(dataset, year) {
  if (dataset === "acs1") return `ACS ${year} 1-Year Estimates, U.S. Census Bureau`;
  return `ACS 5-Year Estimates (${year}), U.S. Census Bureau`;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = queryRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  const { query } = req.body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "Please provide a query." });
  }

  if (query.length > 500) {
    return res.status(400).json({ error: "Query too long." });
  }

  // Parse the natural language query
  const parsed = parseQuery(query);

  if (parsed.error) {
    return res.status(422).json({ error: parsed.error });
  }

  const { variable, geoParams, locationLabel } = parsed;

  // Grab the API key — server-side only, never sent to browser
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) {
    console.error("CENSUS_API_KEY is not set");
    return res.status(500).json({ error: "Server configuration error: missing API key." });
  }

  try {
    // Try 1-Year first (same as the chatbot), fall back to 5-Year with a reason.
    let result = await fetchCensusValueWithMOEAndFallback(variable.id, geoParams, apiKey, {
      year: CURRENT_ACS_YEAR,
    });

    const firstValidation = validateValue(variable.id, result.value);
    if (!firstValidation.ok) {
      // Retry once before giving up
      result = await fetchCensusValueWithMOEAndFallback(variable.id, geoParams, apiKey, {
        year: CURRENT_ACS_YEAR,
      });
      const retryValidation = validateValue(variable.id, result.value);
      if (!retryValidation.ok) {
        return res.status(200).json({
          query,
          location: locationLabel,
          metric: variable.label,
          value: null,
          warning: retryValidation.reason,
          summary: `Data for ${variable.label.toLowerCase()} in ${locationLabel} could not be validated.`,
          source: buildSourceLabel(result.dataset, result.year),
        });
      }
    }

    const { value: rawValue, dataset, year: usedYear } = result;

    const rateResult = await computeRateIfNeeded(variable.id, rawValue, geoParams, apiKey, {
      year: String(usedYear),
      dataset: `acs/${dataset}`,
    });
    const formattedValue = rateResult
      ? formatValue(rateResult.value, rateResult.format)
      : formatValue(rawValue, variable.format);

    return res.status(200).json({
      query,
      location: locationLabel,
      metric: variable.label,
      value: formattedValue,
      summary: `The ${variable.label.toLowerCase()} in ${locationLabel} is ${formattedValue}.`,
      source: buildSourceLabel(dataset, usedYear),
      dataset,
    });
  } catch (err) {
    console.error("Census fetch error:", err.message);
    // "Couldn't find X" means the place/county name didn't match any ACS
    // geography — a permanent miss, not a transient error. Don't say "try again".
    if (/couldn't find/i.test(String(err?.message || ""))) {
      return res.status(404).json({
        error: `Couldn't find "${locationLabel}" in ACS data. Check the spelling, or try a different city, county, or state.`,
      });
    }
    return res.status(500).json({ error: "Failed to fetch data. Please try again." });
  }
}
