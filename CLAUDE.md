# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server on localhost:3000
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint via next lint
```

There are no tests in this project.

## Environment variables

Two keys are required in `.env.local`:
- `ANTHROPIC_API_KEY` — used server-side in `pages/api/chat.js` to call Claude
- `CENSUS_API_KEY` — used server-side to query `api.census.gov`

Neither key is ever sent to the browser.

## Architecture

**Next.js 14 app (Pages Router).** All data fetching happens server-side in API routes; the browser only calls `/api/*`.

### Pages
| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/chat` | Claude-powered chatbot with four modes (Learn, Find Statistic, Create Visualization, Auto) |
| `/explore` | Three-step wizard: pick metrics → pick location → view results |
| `/about` | Static about page |

### API routes (`pages/api/`)
- **`/api/chat`** — Main chatbot endpoint. Runs an agentic loop (up to 5 iterations, 55s total budget) using Claude `claude-sonnet-4-6`. Handles five tools: `lookup_census_data` (single-year curated stat), `lookup_census_variable` (any free-form ACS variable), `get_census_trend` (multi-year series), `get_census_breakdown` (categorical bar chart), and `search_acs_docs` (RAG over indexed ACS docs). Supports four modes passed in the request body: `learn`, `statistic`, `visualize`, `auto`. Statistic mode has a deterministic fast path that bypasses the loop; it falls back to the loop when a query can't be resolved directly.
- **`/api/query`** — Direct Census lookup without Claude. Parses a natural-language query string and returns a structured result.
- **`/api/trend`** — Thin HTTP wrapper over `lib/trend.js`'s `runTrend`. Used by the explore wizard. The chat route calls `runTrend` directly in-process (no self-HTTP round-trip) when Claude invokes the trend tool.

### Skills system (`skills/`)
Markdown files injected into the Claude system prompt at runtime. Two are always loaded; the rest are conditionally loaded based on keyword matching in the user's message:
- **Always on:** `acs-general/ACS_SKILL.md`, `humanize/Humanize_SKILL.md`
- **Conditional:** `acs-data-interpreter`, `acs-geography`, `acs-table-selector`, `acs-api-builder`, `acs-variable-definitions`, `acs-temporal-caveats`
- **Mode-specific:** `learn`, `statistic`, `visualize`, and `auto` modes each pull a fixed subset of skills (`visualize` and `auto` add `acs-react-chart`)

Skills are cached at module load time (`_skillCache` Map) so files are only read once per cold start.

### Data layer (`lib/`)
- **`censusTranslator.js`** — Parses natural-language queries into Census variable IDs + geo parameters (`parseQuery`), and formats raw values (`formatValue`). Contains `VARIABLE_MAP` mapping keyword phrases to ACS variable objects.
- **`censusApi.js`** — Fetches from `api.census.gov/data/{year}/acs/{dataset}`. Key functions: `fetchCensusValue` (estimate only), `fetchCensusValueWithMOE` (estimate + margin of error — both share the `fetchCensusRow` core), `fetchCensusValueWithMOEAndFallback` (tries ACS 1-Year, falls back to 5-Year with a reason), and `fetchCensusVariable` (used for trends, with in-memory caching by `year:variable:dataset:geoParams`).
- **`trend.js`** — `runTrend(input)` computes a multi-year ACS series and returns `{ status, body }`. Shared by `/api/trend` (HTTP) and the chat route (in-process). Handles geo + variable resolution, per-year variable-id remapping across documented table redesigns, and concept-shift warnings.
- **`censusConstants.js`** — `QUERY_TYPES` (the supported metric names), `STATES_CITIES` (cities per state for the explore wizard), `STATE_NAMES`, and `sessionStorage` key constants.

### Chart flow
When Claude calls the `get_census_trend` tool, the chat route invokes `runTrend` (`lib/trend.js`) in-process, which returns `{ points: [{ year, numericValue }], ... }`. The chat route wraps this in a `{ type: "trend_chart", metric, location, series, source }` JSON payload, which the browser detects and renders via the `TrendChart` component (Recharts). Chart errors return `{ type: "error", message }`.

### Explore wizard
Three pages under `pages/explore/`: metrics selection → location selection → results. State is passed between steps via `sessionStorage` (keys from `censusConstants.js`) and `router.query.from` for animated progress bar transitions.
