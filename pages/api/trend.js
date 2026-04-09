// pages/api/trend.js
import { parseQuery, formatValue } from "../../lib/censusTranslator";
import { fetchCensusOverTime } from "../../lib/censusApi";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Please provide a query." });
  }

  const parsed = parseQuery(query);
  if (parsed.error) return res.status(422).json({ error: parsed.error });

  const { variable, geoParams, locationLabel } = parsed;
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing API key." });

  try {
    const rawPoints = await fetchCensusOverTime(variable.id, geoParams, apiKey);

    const points = rawPoints.map(({ year, rawValue }) => ({
      year,
      value: rawValue !== null ? formatValue(rawValue, variable.format) : null,
      // Keep a numeric version for the chart
      numericValue: rawValue !== null ? parseFloat(rawValue.replace(/[^0-9.-]/g, "")) : null,
    }));

    return res.status(200).json({
      metric: variable.label,
      location: locationLabel,
      points,
      source: "ACS 5-Year Estimates (2018–2022), U.S. Census Bureau",
    });
  } catch (err) {
    console.error("Trend fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}