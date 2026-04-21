# ACS API Query Builder Skill

## Purpose
Construct valid, efficient Census ACS API URLs. Handle multi-variable requests, geography chaining, year loops, and common error patterns.

## Base URL Pattern

```
https://api.census.gov/data/{YEAR}/acs/{DATASET}?get={VARIABLES}&for={GEO}&in={PARENT_GEO}&key={API_KEY}
```

- `YEAR`: 4-digit year (e.g., `2023`)
- `DATASET`: `acs1` (1-year) or `acs5` (5-year)
- `VARIABLES`: comma-separated variable codes + `NAME` (e.g., `NAME,B25064_001E,B19013_001E`)
- Always include `NAME` as the first variable — it returns the geography label
- `key`: Optional but recommended — get free key at api.census.gov/data/key_signup.html

---

## Examples

### State-level rent, single year
```
https://api.census.gov/data/2022/acs/acs1?get=NAME,B25064_001E&for=state:06&key=YOUR_KEY
```

### All states, multiple variables
```
https://api.census.gov/data/2022/acs/acs1?get=NAME,B25064_001E,B19013_001E,B25070_010E&for=state:*&key=YOUR_KEY
```

### City-level (place), within a state
```
https://api.census.gov/data/2022/acs/acs5?get=NAME,B25064_001E&for=place:*&in=state:06&key=YOUR_KEY
```
Then filter results by city name client-side.

### County-level
```
https://api.census.gov/data/2022/acs/acs5?get=NAME,B25064_001E&for=county:*&in=state:06&key=YOUR_KEY
```

### Metro area (CBSA)
```
https://api.census.gov/data/2022/acs/acs1?get=NAME,B25064_001E&for=metropolitan+statistical+area/micropolitan+statistical+area:*&key=YOUR_KEY
```

---

## Multi-Year Fetch Pattern (JavaScript)

Use this pattern to fetch a variable across multiple years for trend analysis:

```javascript
async function fetchMultiYear(variableId, geoParams, years, apiKey) {
  const results = [];

  for (const year of years) {
    const dataset = year === 2020 ? null : (year >= 2009 ? 'acs1' : null);
    if (!dataset) {
      results.push({ year, value: null, note: 'Data not available' });
      continue;
    }

    const params = new URLSearchParams({
      get: `NAME,${variableId}`,
      for: geoParams.forGeo,
      key: apiKey,
    });
    if (geoParams.inGeo) params.set('in', geoParams.inGeo);

    const url = `https://api.census.gov/data/${year}/acs/${dataset}?${params}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      results.push({ year, value: data[1][1], name: data[1][0] });
    } catch (err) {
      results.push({ year, value: null, error: err.message });
    }

    // Respect rate limits — Census API allows ~500 req/day without key
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

// Usage:
const years = [2016, 2017, 2018, 2019, 2021, 2022, 2023]; // skip 2020
const data = await fetchMultiYear('B25064_001E', { forGeo: 'state:06' }, years, API_KEY);
```

---

## Multi-State Fetch Pattern

```javascript
async function fetchMultiState(variableId, stateFipsList, year, apiKey) {
  // Fetch all states at once using wildcard, then filter
  const params = new URLSearchParams({
    get: `NAME,${variableId}`,
    for: 'state:*',
    key: apiKey,
  });

  const url = `https://api.census.gov/data/${year}/acs/acs1?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  const headers = data[0];
  const rows = data.slice(1);
  const stateIdx = headers.indexOf('state');
  const valIdx = 1;

  return rows
    .filter(row => stateFipsList.includes(row[stateIdx]))
    .map(row => ({
      name: row[0],
      fips: row[stateIdx],
      value: row[valIdx],
    }));
}
```

---

## Variable Discovery

To see all available variables for a table:
```
https://api.census.gov/data/2022/acs/acs1/variables.json
```

To get group-level documentation for a specific table (e.g., B25070):
```
https://api.census.gov/data/2022/acs/acs1/groups/B25070.json
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `error: unknown/unsupported geography hierarchy` | Wrong `for`/`in` combination | Check that the geo level supports your `in` parameter |
| `error: There was a problem with your query` | Invalid variable code | Check variable exists for that year using groups endpoint |
| `403` or `404` | Wrong year or dataset | 1-year not available for 2020; check year range |
| Empty result array (only headers) | Geography has no data / too small | Switch to 5-year estimate |
| Value = `-666666666` | Census sentinel for "N/A" | Treat as null in your code |
| Value = `-222222222` | Census sentinel for "median not computed" | Treat as null (sample too small) |

---

## Rate Limits and API Key

- **Without key**: ~500 queries/day
- **With free key**: ~3,000 queries/day (register at census.gov — instant, no credit card)
- **Parallel requests**: Safe to make up to 5 concurrent requests
- **No CORS issues**: Census API supports CORS — can be called from browser, but **always call from server** to protect your API key

## Useful Supplementary Endpoints

```
# All available datasets
https://api.census.gov/data.json

# Variable list for a specific year+dataset
https://api.census.gov/data/2022/acs/acs1/variables.json

# Geography reference
https://api.census.gov/data/2022/acs/acs1/geography.json

# Group/table list
https://api.census.gov/data/2022/acs/acs1/groups.json
```
