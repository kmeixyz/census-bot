// pages/api/chat.js
// Server-side Claude chatbot endpoint with Census API tool use.
// ANTHROPIC_API_KEY is read from .env.local — never exposed to the browser.

export const config = { api: { bodyParser: { sizeLimit: "128kb" } }, maxDuration: 60 };

import Anthropic from "@anthropic-ai/sdk";
import { makeRateLimiter } from "../../lib/rateLimit";
import { parseQuery, parseVariableOnly, formatValue, detectAmbiguousMetric, STATE_FIPS } from "../../lib/censusTranslator";
import { fetchCensusValue, fetchCensusValueWithMOEAndFallback } from "../../lib/censusApi";
import { QUERY_TYPES, CURRENT_ACS_YEAR } from "../../lib/censusConstants";
import { computeRateIfNeeded } from "../../lib/censusRates";
import { validateValue } from "../../lib/validateCensusData";
import { findGeoCandidates, findZctaByZip, extractGeoPhrase, describeCandidate, geoParamsFromCandidate, candidateLabel } from "../../lib/geoCandidates";
import { searchAcsDocs } from "../../lib/acsRag";
import { validateVariableClaim } from "../../lib/acsVariableMetadata";
import {
  formatMOE,
  buildSourceLabel,
  buildSourceTables,
  tableIdOf,
  censusTableUrl,
  attachNuancesAndMethodology,
  buildTrendSourceEntry,
} from "../../lib/sourcing";
import { getRateDenominator } from "../../lib/censusRates";
import { runTrend } from "../../lib/trend";
import { toTitleCase } from "../../lib/strings";

// Strip em dashes from Claude's text replies. Handles three cases:
//  "X — Y"   → "X. Y"   (clause connector → two sentences)
//  "**X** — Y"  → "**X**: Y"  (list descriptor → colon separator)
//  "X —\n"   → "X.\n"  (trailing em dash)
function stripEmDashes(text) {
  if (!text) return text;
  return text
    .replace(/(\*\*[^*]+\*\*)\s+—\s+/g, "$1: ")   // **bold** — desc → **bold**: desc
    .replace(/\s+—\s+/g, ". ")                      // clause connector → period + space
    .replace(/\s+—\n/g, ".\n")                      // trailing em dash before newline
    .replace(/—\s*/g, ". ");                         // any remaining
}

// Build a data.census.gov table URL, geo-filtered when geoParams is available.
function buildCensusTableUrl(tableId, dataset, geoParams) {
  const vintage = dataset === "acs1"
    ? `ACSDT1Y${CURRENT_ACS_YEAR}`
    : dataset === "acs5"
    ? `ACSDT5Y${CURRENT_ACS_YEAR}`
    : null;
  const id = vintage ? `${vintage}.${tableId}` : tableId;
  const base = `https://data.census.gov/table/${id}`;

  if (!geoParams?.forGeo) return base;
  const colonIdx = geoParams.forGeo.indexOf(":");
  const geoType = geoParams.forGeo.slice(0, colonIdx);
  const geoFips = geoParams.forGeo.slice(colonIdx + 1);
  const stateFips = geoParams.inGeo ? geoParams.inGeo.split(":")[1] : null;

  let g = null;
  if (geoType === "place" && stateFips)       g = `160XX00US${stateFips}${geoFips}`;
  else if (geoType === "county" && stateFips) g = `050XX00US${stateFips}${geoFips}`;
  else if (geoType === "state")               g = `040XX00US${geoFips}`;
  else if (geoType.includes("metropolitan statistical area") || geoType.includes("micropolitan"))
                                              g = `310XX00US${geoFips}`;
  else if (geoType === "zip code tabulation area") g = `860XX00US${geoFips}`;

  return g ? `${base}?g=${g}` : base;
}

// Like buildSourceTables but produces geo-filtered data.census.gov URLs using
// buildCensusTableUrl. Preserves the multi-table behavior (numerator + denominator
// when a rate variable has a companion table in a different ACS table series).
function buildGeoSourceTables(variableId, dataset, geoParams) {
  const tables = new Set([tableIdOf(variableId)]);
  const denom = getRateDenominator(variableId);
  if (denom) tables.add(tableIdOf(denom));
  return Array.from(tables).map((tableId) => ({
    tableId,
    url: buildCensusTableUrl(tableId, dataset, geoParams),
  }));
}

import fs from "fs";
import path from "path";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const LOOP_TIMEOUT_MS = 55_000; // 55s total budget (Vercel Pro allows 60s per function)
const OVERLOAD_RETRY_MS = 15_000; // retry 529 errors for up to 15s — leaves budget for subsequent loop iterations
// Warn if system prompt exceeds this many chars (~30k tokens ≈ 120k chars)
const SYSTEM_PROMPT_WARN_CHARS = 80_000;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Retry wrapper for Anthropic overload (529) errors. Backs off exponentially
// (1s, 2s, 4s, 4s, …) until OVERLOAD_RETRY_MS elapses, then rethrows so the
// caller can surface a friendly message. Other errors propagate immediately.
async function createMessageWithRetry(opts, { maxElapsedMs = OVERLOAD_RETRY_MS } = {}) {
  const start = Date.now();
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await client.messages.create(opts);
    } catch (err) {
      const overloaded =
        err?.status === 529 ||
        err?.error?.error?.type === "overloaded_error" ||
        /overloaded/i.test(err?.message || "");
      const elapsed = Date.now() - start;
      const timeLeft = maxElapsedMs - elapsed;
      if (!overloaded || timeLeft <= 0) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 4000, timeLeft);
      attempt++;
      console.log(`[chat] overloaded, retry ${attempt} in ${delay}ms (${Math.round(elapsed / 1000)}s elapsed)`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ── Skill loader — cached at module level so files are only read once per cold start ──
const SKILLS_DIR = path.join(process.cwd(), "skills");

const _skillCache = new Map();

function readSkillCached(filePath) {
  if (_skillCache.has(filePath)) return _skillCache.get(filePath);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    _skillCache.set(filePath, content);
    return content;
  } catch {
    _skillCache.set(filePath, ""); // cache miss so we don't retry on every request
    return "";
  }
}

// Always-on skills — loaded on every request
const ALWAYS_ON_FILES = [
  path.join(SKILLS_DIR, "acs-general", "ACS_SKILL.md"),
  path.join(SKILLS_DIR, "humanize", "Humanize_SKILL.md"),
];

function loadAlwaysOnSkills() {
  return ALWAYS_ON_FILES.map(readSkillCached).filter(Boolean);
}

// Conditional skills — loaded only when the message matches keywords
const CONDITIONAL_SKILLS = [
  {
    file: path.join(SKILLS_DIR, "acs-data-interpreter", "SKILL.md"),
    keywords: ["interpret", "margin of error", "moe", "sentinel", "inflation", "adjust", "percent", "rate", "burden", "cpi", "universe", "mean", "median", "average", "unreliable", "suppressed"],
  },
  {
    file: path.join(SKILLS_DIR, "acs-geography", "SKILL.md"),
    keywords: ["county", "tract", "zip", "zcta", "metro", "cbsa", "fips", "geography", "place", "state", "nation", "nationwide", "region"],
  },
  {
    file: path.join(SKILLS_DIR, "acs-table-selector", "SKILL.md"),
    keywords: ["table", "variable", "b19013", "b25064", "b25070", "b07", "which table", "what table", "acs table", "dataset"],
  },
  {
    file: path.join(SKILLS_DIR, "acs-api-builder", "SKILL.md"),
    keywords: ["api", "url", "endpoint", "fetch", "request", "query string", "build", "construct", "http"],
  },
  {
    file: path.join(SKILLS_DIR, "acs-variable-definitions", "SKILL.md"),
    keywords: ["rate", "percent", "poverty", "unemployment", "unemployed", "commute", "travel time", "education", "bachelor"],
  },
  {
    file: path.join(SKILLS_DIR, "acs-temporal-caveats", "SKILL.md"),
    keywords: ["trend", "over time", "change", "since", "compared to", "grew", "growth", "decline", "increase", "decrease", "historical", "year", "years", "2010", "2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "boundary", "annex", "tract", "zcta", "zip", "metro area", "cbsa", "before and after", "pre-covid", "post-covid", "race", "multiracial"],
  },
];

function loadConditionalSkills(userMessage) {
  const lower = userMessage.toLowerCase();
  const loaded = [];
  for (const skill of CONDITIONAL_SKILLS) {
    if (skill.keywords.some(kw => lower.includes(kw))) {
      const content = readSkillCached(skill.file);
      if (content) loaded.push(content);
    }
  }
  return loaded;
}

// Tool definition — Claude calls this to look up live Census data
const CENSUS_TOOL = {
  name: "lookup_census_data",
  description:
    "Look up a live U.S. Census ACS statistic for a specific city and state. " +
    "Use this whenever the user asks for a specific metric about a real place. " +
    `Available metrics: ${QUERY_TYPES.join(", ")}.`,
  input_schema: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        enum: QUERY_TYPES,
        description: `The data metric to look up. Must be one of: ${QUERY_TYPES.join(", ")}.`,
      },
      city: {
        type: "string",
        description: "The city name, e.g. 'Chicago'.",
      },
      state: {
        type: "string",
        description: "The full state name, e.g. 'Illinois'.",
      },
    },
    required: ["metric", "city", "state"],
  },
};

const TREND_TOOL = {
  name: "get_census_trend",
  description:
    "Fetch multi-year Census ACS time series for any variable across any geography. Use for graphs or trends. " +
    "Pass a free-form location string — the server resolves it to a Census geography. " +
    "Supports cities ('Austin, Texas'), states ('California'), counties ('Cook County, Illinois'), " +
    "metro areas ('New York-Newark metro'), and ZIP codes ('zip 90210'). " +
    "For VARIABLE: pick ONE — pass `metric` for curated metrics (median rent, population, " +
    "unemployment rate, etc.), OR pass `variable_id` + `label` + `unit` + `table_id` for ANY ACS " +
    "variable (race breakdowns from B02001/B03002, household type from B11001, language at home " +
    "from B16001, etc. — same shape as lookup_census_variable). " +
    "Pass `share_of_variable_id` to compute a year-by-year share (returns percent).",
  input_schema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "Geography expression — anything ACS publishes. Examples: 'Austin, Texas', 'California', 'Cook County, Illinois', 'zip 90210'.",
      },
      metric: {
        type: "string",
        description: "Curated metric name (see lookup_census_data list). Use this OR variable_id, not both.",
      },
      variable_id: {
        type: "string",
        description: "ACS variable ID like 'B03002_006E' for free-form trends. Required when metric isn't on the curated list. Always pair with label, unit, and table_id.",
      },
      label: {
        type: "string",
        description: "Precise human-readable label for the variable (e.g. 'Asian Alone, Not Hispanic'). Required when variable_id is given.",
      },
      unit: {
        type: "string",
        enum: ["number", "currency", "percent", "years", "minutes", "index"],
        description: "Format for the values. Required when variable_id is given.",
      },
      table_id: {
        type: "string",
        description: "ACS table ID like 'B02001'. Required when variable_id is given.",
      },
      share_of_variable_id: {
        type: "string",
        description: "Optional: divide the variable by this denominator (variable ID) and return percent. Use only when the user explicitly asks for a share over time.",
      },
      startYear: {
        type: "number",
        description: `First year of the trend window. ACS 5-Year coverage starts at 2009.`,
      },
      endYear: {
        type: "number",
        description: `Last year of the trend window. The latest ACS 5-Year vintage is ${CURRENT_ACS_YEAR} — pass that unless the user asks for an older endpoint.`,
      },
    },
    required: ["location", "startYear", "endYear"],
  },
};

// Free-form variable lookup — used by Claude when the user's metric isn't on
// the curated lookup_census_data list (e.g., race breakdowns by table B02001 /
// B03002, language at home, household type, foreign-born by region of origin,
// any specific Census variable ID Claude can identify from its skills/docs).
//
// The shape mirrors lookup_census_data's structured payload so the existing
// StatCard component renders it without UI changes.
const ACS_VARIABLE_TOOL = {
  name: "lookup_census_variable",
  description:
    "Look up ANY Census ACS variable for a city/state/county/ZIP code area when the metric " +
    "the user wants is NOT on the curated lookup_census_data enum. Examples: race breakdowns " +
    "from B02001 or B03002, household type from B11001, language spoken at home from B16001, " +
    "region of birth from B05006, rooms / bedrooms from B25017 / B25041, etc. Always pick the " +
    "most precise variable for the user's question and pass a precise human-readable label so the " +
    "displayed result is unambiguous (e.g., not 'Asian' but 'Asian Alone, Not Hispanic'). Always " +
    "include the table_id so the source link works. Use share_of_variable_id only when the user " +
    "explicitly asked for a percentage or share — for raw counts, omit it. " +
    "For ZIP code queries, pass zip_code='60618' and omit city/state.",
  input_schema: {
    type: "object",
    properties: {
      variable_id: {
        type: "string",
        description: "Census variable ID, e.g. 'B03002_006E'. Must be a real ACS variable.",
      },
      label: {
        type: "string",
        description: "Precise human-readable label for what this variable represents. Be specific: 'Asian Alone, Not Hispanic' not 'Asian Population'. 'Median Gross Rent' not 'Rent'.",
      },
      unit: {
        type: "string",
        enum: ["number", "currency", "percent", "years", "minutes", "index"],
        description: "How the value should be formatted.",
      },
      table_id: {
        type: "string",
        description: "ACS table ID like 'B02001'. Used to build the source link.",
      },
      zip_code: {
        type: "string",
        description: "5-digit ZIP code when the user asked about a specific ZIP code area (ZCTA), e.g. '60618'. When provided, omit city and state.",
      },
      city: {
        type: "string",
        description: "City name, e.g. 'Chicago'. For state-only or county-only queries, pass the empty string. Omit when using zip_code.",
      },
      state: {
        type: "string",
        description: "Full state name, e.g. 'Illinois'. Omit when using zip_code.",
      },
      share_of_variable_id: {
        type: "string",
        description: "Optional: when the user asks for a percentage/share, divide variable_id by this denominator variable ID and return percent.",
      },
    },
    required: ["variable_id", "label", "unit", "table_id"],
  },
};

// RAG search over the indexed ACS source documents. Used when the user asks
// about ACS concepts, methodology, definitions, MOEs, table contents, etc.
const ACS_DOCS_TOOL = {
  name: "search_acs_docs",
  description:
    "Search the indexed corpus of official ACS documentation (Census Bureau handbooks, " +
    "the Design and Methodology Report, the Subject Definitions, and the 'Why we ask " +
    "each question' topic pages). Use this whenever the user asks ABOUT the ACS itself " +
    "— what a concept means, how a number is computed, how MOEs work, what a table " +
    "covers, what counts as a household, why the survey asks a given question, " +
    "differences between 1-year and 5-year estimates, etc. Do NOT use it for fetching " +
    "specific numbers about a place — use lookup_census_data or get_census_trend for that.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural-language search query — what to look up in the docs.",
      },
      top_k: {
        type: "number",
        description: "Max passages to return. Defaults to 5; cap at 8.",
      },
    },
    required: ["query"],
  },
};

// Categorical breakdown — fetches multiple ACS variables for ONE place and
// renders them as a horizontal bar chart. Use for "race in Irvine",
// "languages spoken at home in Queens", "household types in Detroit", etc.
// (any single-place categorical comparison that doesn't fit the trend tool).
const BREAKDOWN_TOOL = {
  name: "get_census_breakdown",
  description:
    "Fetch multiple ACS variables for ONE place and render them as a horizontal bar chart. " +
    "Use for categorical breakdowns: race composition, language at home, household type, " +
    "place of birth, education attainment levels. Pass each bar's variable_id + label + " +
    "table_id (same shape as lookup_census_variable). The server fetches them in parallel, " +
    "validates each variable claim, and emits a bar_chart payload sorted descending by value. " +
    "Pass `share_of_variable_id` (e.g. B02001_001E for total population) to render bars as " +
    "percentages of that denominator instead of raw counts.",
  input_schema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "Geography expression. Examples: 'Irvine, California', 'Cook County, Illinois', 'zip 90210'.",
      },
      title: {
        type: "string",
        description: "Short human-readable title for the chart, e.g. 'Race composition' or 'Language spoken at home'.",
      },
      bars: {
        type: "array",
        description: "List of variables to plot, one per bar. Order is irrelevant — server sorts by value.",
        items: {
          type: "object",
          properties: {
            variable_id: {
              type: "string",
              description: "ACS variable ID like 'B02001_002E'. Must be a real ACS variable.",
            },
            label: {
              type: "string",
              description: "Precise human-readable bar label, e.g. 'White Alone' (not just 'White').",
            },
            table_id: {
              type: "string",
              description: "ACS table ID like 'B02001'.",
            },
          },
          required: ["variable_id", "label", "table_id"],
        },
        minItems: 2,
      },
      unit: {
        type: "string",
        enum: ["number", "currency", "percent", "years", "minutes"],
        description: "Format for the bar values. Defaults to 'number' for raw counts. If `share_of_variable_id` is set, server overrides to 'percent'.",
      },
      share_of_variable_id: {
        type: "string",
        description: "Optional: divide each bar's value by this denominator (one variable id) and render as percent. Example: B02001_001E for race-as-share-of-total-population.",
      },
    },
    required: ["location", "title", "bars"],
  },
};

// Words that explicitly ask for a chart or graph. Used *only* to refine the
// fast path's chart route inside statistic mode — they never gate the
// agentic loop's output contract.
//
// Mode is the single source of truth for whether a chart is wanted. This
// predicate lets a statistic-mode user opt in to the chart route by being
// explicit ("rent chart for Austin") without polluting other modes.
//
// Words like "trend" / "change" / "compare" / "historical" describe CONTENT
// (time-series, side-by-side) — not FORM (a chart). They're intentionally
// excluded so statistic-mode users typing those still get numbers.
const EXPLICIT_CHART_KEYWORDS = [
  "graph",
  "chart",
  "visualization",
  "visualize",
];

const BASE_SYSTEM_PROMPT = `You are a knowledgeable U.S. Census data assistant built into CensusBot.
You help users understand American Community Survey (ACS) data — income, rent, population, poverty rates, employment, age, and commute times for U.S. cities.

You have access to a live Census data lookup tool. Use it proactively when a user asks about specific metrics for a city/state — don't describe what you could look up, just call the tool and return the real number.

CURRENT ACS DATA YEAR: ${CURRENT_ACS_YEAR}.
- The most recent published ACS 1-Year vintage is ${CURRENT_ACS_YEAR}.
- The most recent ACS 5-Year vintage covers ${Number(CURRENT_ACS_YEAR) - 4}–${CURRENT_ACS_YEAR}.
- When the user says "latest", "current", "now", "this year", or asks about trends without
  specifying years, anchor your reasoning to ${CURRENT_ACS_YEAR}. Do NOT default to ${Number(CURRENT_ACS_YEAR) - 1}
  or earlier from your training data — ${CURRENT_ACS_YEAR} is published and available.
- For trend windows, prefer endYear=${CURRENT_ACS_YEAR}; pick startYear based on how
  many years the user wants (default to 10 unless they specify).

Available metrics: ${QUERY_TYPES.join(", ")}.

TOOL RULES:
- ABSOLUTE: You MUST NOT state any specific ACS statistic — count, dollar
  amount, percent, year-over-year change — without first calling a tool that
  returned that exact number. This applies even to numbers you "know" from
  training data. There is no exception.
  Wrong:  "The Vietnamese population in San Jose is 101,997."     (no tool call)
  Right:  call lookup_census_variable with variable_id="B02015_009E",
          label="Vietnamese Alone", unit="number", table_id="B02015",
          city="San Jose", state="California", then quote the number it
          returned.
- lookup_census_data is for single-year statistics about a specific place,
  using one of the curated metrics in the "Available metrics" list above.
- lookup_census_variable is for ANY ACS metric NOT on that curated list —
  race breakdowns by table B02001 / B03002 / B02015, household type from
  B11001, language at home from B16001, region of birth from B05006, room
  counts from B25017 / B25041, etc. You supply the exact Census variable_id,
  a PRECISE label (specific enough that the user knows what was returned;
  use "Asian Alone, Not Hispanic" not "Asian Population"; use "Vietnamese
  Alone" not "Vietnamese Population"), the unit, and the table_id. The tool
  also accepts county-level queries: pass the county name in the city field
  (e.g. city = "Queens County", state = "New York"). Only use variable IDs
  you are confident exist; if uncertain, call search_acs_docs first.

  If lookup_census_variable returns an error with an "ambiguous" or
  "candidates" field, DO NOT pick one yourself — show the candidates back to
  the user as a question and let them clarify. Format the question briefly:
    "Which 'Springfield' did you mean? Springfield, IL · Springfield, MA · Springfield, MO · ..."
  Wait for the user's reply, then call the tool again with the resolved geo.

  If lookup_census_variable returns a "Wrong variable for ..." error with
  suggested variable_ids embedded in the message, you MUST retry the tool
  call IMMEDIATELY using one of the suggestions — do NOT write a text reply
  giving up. The validator's whole job is to redirect you to the correct
  variable; use its suggestions on the next iteration.
- get_census_trend is for multi-year time-series data about a place; the
  server combines its results into a chart payload. Only call it when the
  user actually wants a chart — see the mode-specific instructions below.
- search_acs_docs is for ACS concepts, methodology, and variable definitions.

GROUNDING RULES (cite-what-you-have, never fabricate):
- You MAY mention any ACS table ID, dataset name, source label, doc title,
  page number, or methodology detail that came from a tool result you just
  received (e.g. lookup_census_data returns a "table" field; search_acs_docs
  returns "chunk_id" + "doc_title").
- You MUST NOT invent table IDs, variable IDs, dataset names, page numbers,
  or Census API URLs from your own knowledge. If you didn't see it in a tool
  result, don't say it. The Census table catalog is large and easy to
  confuse — a wrong table ID looks authoritative and misleads the user.
- If the user asks "what table covers X?" or "what's the API URL for Y?",
  call search_acs_docs first; only quote what it returns.
- Do NOT describe how to fetch data externally (manual API URL construction,
  scraping, etc.) unless it comes directly from search_acs_docs.

CHART OUTPUT RULES (apply only when the mode-specific instructions below say to call get_census_trend):
- The server constructs the final chart JSON from tool results. Your job is
  only to make the right tool calls; NEVER hand-author chart JSON or any
  object containing "type":"chart" / "type":"trend_chart".
- If a tool call you'd need can't be made (e.g. you don't have city + state),
  say so in plain text — do NOT fabricate chart data.
- Do NOT include explanation text with chart JSON.
- Do NOT output CSV, markdown tables, external-tool suggestions, graphing
  steps, mentions of Recharts/Excel/Sheets, or raw variable IDs.

LOCATION ACCURACY RULE:
When the user specifies a "City, State" pair, pass EXACTLY that to the tool —
never substitute a different state from your own knowledge. If the tool returns
a "couldn't find" or "did you mean" error, relay the suggestion to the user in
one short sentence and ask them to confirm before retrying. Do not produce a
chart or statistic for a location the user didn't confirm.

If no tool succeeded for the user's question:
- Don't fill the gap with invented tables, variable IDs, or API URLs from
  your own knowledge — same grounding rule applies.
- Say in plain text what you couldn't get and what would help (e.g. "I
  couldn't resolve that place — try 'City, State' format").

UNSUPPORTED GEOGRAPHIES:
CensusBot looks up ACS data for cities, counties, metro areas (CBSAs), ZIP
codes (ZCTAs), and states. It does NOT aggregate census tracts into
neighborhoods, Chicago community areas, school districts, council districts,
or any other custom boundary. If a user asks about one of those, say plainly
that we don't aggregate tracts — never suggest "try a neighborhood", "try a
community area", or "try a tract" as an alternative, because the tools can't
deliver them. Steer the user toward the supported levels (city, county,
metro, ZIP, state) instead.

MULTI-GEOGRAPHY QUERIES ("by county in [State]", "all counties in [State]"):
The tools look up ONE geography at a time. A query like "unemployment rate by
county in Illinois" or "all counties in Texas" is NOT supported — do not call
lookup_census_data or lookup_census_variable with city="" to attempt it. If
the user asks for data across all counties or all cities in a state, tell them
plainly that bulk county/city listings aren't supported and suggest they ask
about a specific county or city (e.g. "Cook County, Illinois").

DOCUMENTATION QUESTIONS (concepts, methodology, definitions):
When the user asks about WHAT something means, HOW the ACS measures it, MOEs,
1-year vs 5-year differences, what a table covers, who is included in a
universe, etc. — call search_acs_docs FIRST, then answer using the returned
passages.

When citing search_acs_docs results, do this exactly:
- Weave numbered markers like [1], [2] into prose right after the claim they support.
- The numbers MUST match the 'index' field on each passage you used.
- After your prose, on a new line, write the literal token "Sources:" followed
  by one line per cited source in this exact format:
    [N] <chunk_id>
  where chunk_id is the 'chunk_id' field from the tool result. Example:
    Sources:
    [1] subject-definitions__p41__0
    [2] handbook-general__p18__2
- Do NOT include the doc title or page number on the Sources lines — the UI
  resolves those from chunk_id. Just "[N] chunk_id".
- Only cite passages you actually used. Don't pad with unused results.
- If search_acs_docs returns an error or zero passages, answer from general
  knowledge without citations and don't fabricate a Sources block.

Formatting rules (strictly follow these):
- This is a chat UI. Never use --- dividers, ## headers, or ### headers.
- Use **bold** only for key numbers or metric names. No bold mid-sentence for decoration.
- Use plain line breaks between points. Short bullet lists are fine for multiple items.
- Keep responses tight: 2–4 sentences max for single-metric answers. No preamble, no sign-off.
- Lead with the number, then one sentence of context if useful. That's it.
- Don't make up numbers — always use the tool for specific statistics.
- If a metric or location isn't supported, say so in one sentence and suggest the closest option.
- If a tool call returns an error: respond with ONE short sentence explaining what went wrong and a clarifying question so the user can correct it. Do not retry the same call. Never give a generic non-answer — explain the specific problem.

Writing style (apply to every response you write):
- NEVER use em dashes (—) anywhere in your response. This is absolute. Replace every em dash with a period, comma, or parentheses. "X — Y" becomes "X. Y" or "X, Y".
- No opener phrases: never start with "Great", "Of course", "Certainly!", "Sure!", "Absolutely", "Happy to", "Thanks for", or any filler acknowledgment. Start with the actual answer.
- Use contractions: don't, won't, can't, it's, that's.
- Vary sentence length. Short sentences hit hard. Follow with a longer one when context is needed.
- Plain words over formal ones: "use" not "utilize", "show" not "demonstrate", "about" not "approximately".
- Delete hedging: remove "perhaps", "potentially", "it could be said", "it's worth noting".`

// ── Mode-specific skill routing ─────────────────────────────────────────────
const MODE_SKILLS = {
  learn: [
    // Educational mode: general ACS knowledge, data interpretation
    path.join(SKILLS_DIR, "acs-data-interpreter", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-table-selector", "SKILL.md"),
  ],
  statistic: [
    // Data lookup mode: geography, interpretation, conditional by keywords
    path.join(SKILLS_DIR, "acs-data-interpreter", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-geography", "SKILL.md"),
  ],
  visualize: [
    // Visualization mode: data interpretation + table selection + react chart contract
    path.join(SKILLS_DIR, "acs-react-chart", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-data-interpreter", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-geography", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-temporal-caveats", "SKILL.md"),
  ],
  auto: [
    // Unified mode: all skills loaded so Claude can chart, stat, or explain as appropriate
    path.join(SKILLS_DIR, "acs-react-chart", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-data-interpreter", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-geography", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-temporal-caveats", "SKILL.md"),
    path.join(SKILLS_DIR, "acs-table-selector", "SKILL.md"),
  ],
};

const MODE_PROMPTS = {
  learn: `
Mode: LEARN. The user wants to understand ACS concepts, methodology, definitions, MOEs, what a table covers, etc.
- Call search_acs_docs FIRST for any concept/methodology question, then answer using the returned passages.
- Call lookup_census_data only if the user asks for a specific number about a specific place.
- NEVER call get_census_trend in this mode — even if the user mentions trends or comparisons. Charts belong in Visualization mode.
- Prefer plain-language teaching over raw numbers.`,
  statistic: `
Mode: FIND STATISTIC. The user wants specific numbers, NOT charts.
- Always call lookup_census_data when they give a metric and place.
- For "compare X and Y" / "X vs Y" queries: call lookup_census_data ONCE PER PLACE in parallel and write a short side-by-side text comparison. NEVER call get_census_trend for compare queries in this mode.
- For "trend" / "over time" / "change" / "historical" / "since 2020" wording: still call lookup_census_data and return the latest single-year value as plain text. The user is in Statistic mode — if they want a chart, they will switch modes.
- The ONLY exception is if the user explicitly says "graph", "chart", "visualize", or "visualization" — then call get_census_trend so the server can build the chart.
- Only report data returned by tools. Never add ACS table IDs, variable IDs, URL instructions, or methodology unless explicitly present in tool output.`,
  visualize: `
Mode: VISUALIZATION. The user wants charts. Every answer in this mode is a chart.
- Always call get_census_trend (never lookup_census_data) for the data series.
- For "compare X and Y" queries: call get_census_trend ONCE PER PLACE in parallel — the server combines the results into a multi-line chart.
- For single-place queries: one get_census_trend call is enough; the server renders a single line.
- For multi-variable single-place queries (e.g. "education level trend in Boston"): call get_census_trend ONCE PER VARIABLE (e.g. bachelor's degree, some college, high school diploma) all for the SAME location — the server combines them into a multi-line chart with variable labels as the legend. Use a distinct label for each variable so the chart legend is informative.
- If the user's request can't be expressed as a chart (no place, ambiguous metric, etc.), say so in plain text — do NOT call lookup_census_data instead. Charts only.
- Never provide external API instructions, ACS table guesses, or variable guesses.
- After the tool calls complete, write 2–3 sentences describing what the chart shows: the key trend, any notable differences between series, and what it means in context. This description appears outside the chart for the user.`,
  auto: `
Mode: AUTO. You decide the best response format based on what the user is asking.

WHEN TO LOOK UP A STATISTIC (one or more specific data points, no chart needed):
- User asks for a number about a place ("What is the median income in Austin?", "What's the poverty rate in Chicago?")
- Comparison across two or more places at the same point in time ("compare X and Y", "X vs Y") — call lookup_census_data once per place, then write a short text comparison. NEVER call get_census_trend for same-time comparisons.

WHEN TO CHART (call get_census_trend or get_census_breakdown):
- User asks about change over time ("trend", "over time", "how has X changed", "since 2010", "growth", "decline", "historical") — call get_census_trend
- User explicitly asks for a chart, graph, or visualization
- Multi-variable comparison at one place (e.g. "education levels in Boston") — call get_census_trend ONCE PER VARIABLE for the SAME location; the server combines them into a multi-line chart
- Categorical breakdown at one location (race, language, household type) — call get_census_breakdown
- After any chart tool calls complete, write 2–3 sentences describing what the data shows: the key trend, notable differences, and context.

WHEN TO SEARCH DOCS (call search_acs_docs FIRST):
- User asks what something means, how ACS measures it, MOEs, 1-year vs 5-year differences, what a table covers, methodology questions

WHEN TO ANSWER IN PLAIN TEXT (no tool call needed):
- Visualization planning or advice ("How should I visualize...", "Help me plan a chart", "What chart type should I use") — answer with concrete suggestions; if they want actual data, ask for a specific location
- Questions about CensusBot capabilities ("Can you make maps?", "What can you show me?") — answer directly; note that maps are not supported but trend and bar charts are
- "Migration" questions that are ambiguous — clarify whether they mean domestic migration (people moving between states/counties) or international/immigration, and which geography they want, before fetching data
- General Census/ACS questions without a specific metric or location — answer from knowledge, no tool needed

DEFAULT:
- Prefer statistic lookups for current data questions; chart only when the question is naturally about trends or change over time.
- Never call get_census_trend for a single-year value — use lookup_census_data.
- If you don't have enough information (missing place or metric), ask for clarification rather than guessing.`,
};

function buildSystemPrompt(userMessage, mode) {
  const alwaysOn = loadAlwaysOnSkills();

  // Load mode-specific skills
  const modeFiles = MODE_SKILLS[mode] || MODE_SKILLS.statistic;
  const modeSkills = modeFiles.map(readSkillCached).filter(Boolean);

  // Also load keyword-conditional skills
  const conditional = loadConditionalSkills(userMessage);

  // Deduplicate (mode skills may overlap with conditional)
  const allSkills = [...new Set([...modeSkills, ...conditional])];

  const parts = [BASE_SYSTEM_PROMPT + (MODE_PROMPTS[mode] || "")];
  if (alwaysOn.length > 0) parts.push("---\n" + alwaysOn.join("\n\n---\n"));
  if (allSkills.length > 0) parts.push("---\n" + allSkills.join("\n\n---\n"));
  const prompt = parts.join("\n\n");

  if (prompt.length > SYSTEM_PROMPT_WARN_CHARS) {
    console.warn(
      `[chat] System prompt is large (${prompt.length} chars / ~${Math.round(prompt.length / 4)} tokens). ` +
      "Consider trimming skills to avoid hitting context limits."
    );
  }

  return prompt;
}

// Run the ACS documentation search tool. Returns either a passages array or
// an error object — both are valid Claude tool_result payloads.
async function runAcsDocsTool(toolInput) {
  const query = typeof toolInput?.query === "string" ? toolInput.query.trim() : "";
  const topK = Number.isFinite(toolInput?.top_k)
    ? Math.min(8, Math.max(1, toolInput.top_k))
    : 5;
  if (!query) return { error: "search_acs_docs: missing 'query'." };
  try {
    const { results } = await searchAcsDocs(query, { topK });
    if (results.length === 0) {
      return { passages: [], note: "No matching passages found in the indexed ACS docs." };
    }
    // Return a compact form Claude can cite. Truncate text to keep tool_result tokens reasonable.
    return {
      passages: results.map((r, i) => ({
        index: i + 1, // 1-based — matches the [N] citation form
        chunk_id: r.chunk_id,
        doc_title: r.doc_title,
        doc_kind: r.doc_kind,
        page: r.page,
        text: r.text.length > 1200 ? r.text.slice(0, 1200) + "…" : r.text,
        score: Number(r.score.toFixed(3)),
      })),
    };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/index not found/i.test(msg)) {
      return { error: "ACS docs index has not been built yet. Answer from general knowledge without citations." };
    }
    return { error: `search_acs_docs failed: ${msg}` };
  }
}

// Runs lookup_census_variable for a free-form Claude-supplied variable ID.
// Returns the same structured shape as runCensusTool so the chat handler can
// surface it through the existing StatCard rendering path.
async function runAcsVariableTool(toolInput) {
  const censusApiKey = process.env.CENSUS_API_KEY;
  if (!censusApiKey) return { error: "Census API key not configured on server." };

  const { variable_id, label, unit, table_id, zip_code, city, state, share_of_variable_id } = toolInput || {};
  console.log(`[acs-var] call: variable_id=${variable_id}, label="${label}", table_id=${table_id}, zip_code="${zip_code}", city="${city}", state="${state}"`);

  if (!variable_id || !/^[A-Z]\d+_\d+[A-Z]?$/.test(String(variable_id).trim())) {
    return { error: `Invalid variable_id '${variable_id}'. Must look like 'B03002_006E'.` };
  }
  if (!label || !unit || !table_id) {
    return { error: "Missing required fields. lookup_census_variable needs variable_id, label, unit, table_id, and either zip_code or city+state." };
  }
  if (!zip_code && !state) {
    return { error: "Missing geography. Provide zip_code for a ZIP code area, or city + state for a city/county/state." };
  }

  // Validate the variable_id against the live ACS metadata BEFORE fetching.
  // Catches hallucinated picks (e.g. Claude claiming B02015_009E is "Vietnamese
  // Alone" when it's actually "Other East Asian"). Returns a structured error
  // back to Claude so it can revise its tool call or fall back to search_acs_docs.
  const validationError = await validateVariableClaim({ variable_id, label, table_id });
  if (validationError) return { error: validationError, kind: "variable_validation" };

  let geoParams = null;
  let locationLabel = null;
  let pickedPopulation = null;
  let pickedGeoType = null;

  // ZIP code path — resolve to ZCTA candidate before attempting city/state lookup.
  if (zip_code) {
    const digits = String(zip_code).trim().replace(/\D/g, "");
    if (digits.length !== 5) {
      return { error: `zip_code must be exactly 5 digits, got '${zip_code}'.` };
    }
    const zctaCandidate = await findZctaByZip(digits).catch(() => null);
    if (!zctaCandidate) {
      return {
        error: `ZIP code ${digits} is not published as a ZCTA in ACS data. It may be a P.O. box or institutional ZIP. Try asking the user for a nearby residential ZIP or the city name instead.`,
      };
    }
    geoParams = geoParamsFromCandidate(zctaCandidate);
    locationLabel = `ZIP ${digits}`;
    pickedGeoType = "zcta";
  }

  // City/state path — try the curated parser first (handles plain "City, State"
  // and states), then fall back to findGeoCandidates for counties, CDPs, and any
  // other Census geography parseQuery doesn't natively cover. If multiple
  // candidates match, we return them so Claude can ask the user to clarify
  // rather than silently picking one.
  if (!geoParams) {
    const queryStr = city ? `${label} in ${city}, ${state}` : `${label} in ${state}`;
    try {
      const parsed = parseQuery(queryStr);
      if (!parsed.error && parsed.geoParams) {
        geoParams = parsed.geoParams;
        locationLabel = parsed.locationLabel;
      }
    } catch {
      // fall through to candidate lookup
    }

    if (!geoParams && city) {
      try {
        const candidates = await findGeoCandidates(city, { stateName: state || null });
        if (candidates && candidates.length >= 1) {
          // Prompt for clarification ONLY when candidates span multiple states —
          // those are the cases where picking automatically would silently give
          // the wrong answer (e.g. "Springfield" with no state). When all
          // candidates are in the same state, take the top-ranked one (same
          // behavior as the curated fast path's defaultGeo).
          const stateSet = new Set(candidates.map(c => c.stateName).filter(Boolean));
          if (stateSet.size > 1 && !state) {
            return {
              error: `"${city}" matches multiple geographies across different states. Ask the user to clarify which one — options include: ${candidates.slice(0, 6).map(c => describeCandidate(c).label).join("; ")}.`,
              ambiguous: true,
              candidates: candidates.slice(0, 6).map(c => ({
                label: describeCandidate(c).label,
                sublabel: describeCandidate(c).sublabel,
                geoType: c.geoType,
              })),
            };
          }
          const picked = candidates[0];
          geoParams = geoParamsFromCandidate(picked);
          locationLabel = candidateLabel(picked);
          pickedPopulation = typeof picked.population === "number" ? picked.population : null;
          pickedGeoType = picked.geoType || null;
        }
      } catch {
        // candidate lookup failed — fall through to "couldn't resolve" error
      }
    }

    if (!geoParams) {
      // No match — do a nationwide search for the city name and suggest the
      // closest result so Claude can ask the user to confirm before retrying.
      if (city) {
        const nationwideCandidates = await findGeoCandidates(city, { stateName: null }).catch(() => []);
        if (nationwideCandidates && nationwideCandidates.length > 0) {
          const best = nationwideCandidates[0];
          const suggestedLabel = candidateLabel(best);
          return {
            error: `Couldn't find "${city}, ${state}" in ACS data. Did you mean ${suggestedLabel}? Ask the user to confirm before retrying.`,
            geo_not_found: true,
            requested_phrase: `${city}, ${state}`,
            suggested_label: suggestedLabel,
          };
        }
      }
      return {
        error: `Could not resolve "${city}, ${state}" to a Census geography. Ask the user to clarify the location.`,
      };
    }
  }

  const parsed = { geoParams, locationLabel };

  try {
    // Always prefer ACS 1-year; fall back to 5-year only when 1-year truly
    // can't deliver. Returns { value, moe, dataset, year, fallbackReason }
    // where fallbackReason explains the specific cause when dataset=="acs5".
    const fetchResult = await fetchCensusValueWithMOEAndFallback(
      variable_id, parsed.geoParams, censusApiKey,
      { year: CURRENT_ACS_YEAR, population: pickedPopulation, geoType: pickedGeoType }
    );
    const rawValue = fetchResult.value;
    const numericMOE = fetchResult.moe == null ? null : parseFloat(fetchResult.moe);
    const dataset = fetchResult.dataset; // "acs1" or "acs5"
    const fallbackReason = fetchResult.fallbackReason || null;
    console.log(`[acs-var] fetched ${variable_id} → "${rawValue}" (dataset=${dataset}, geoParams=${JSON.stringify(parsed.geoParams)})`);
    let numericValue = parseFloat(rawValue);

    // Optional denominator division for share-of queries — match the source dataset.
    if (share_of_variable_id && /^[A-Z]\d+_\d+[A-Z]?$/.test(String(share_of_variable_id).trim())) {
      const denomDataset = dataset === "acs1" ? "acs/acs1" : "acs/acs5";
      const denom = await fetchCensusValue(share_of_variable_id, parsed.geoParams, censusApiKey, CURRENT_ACS_YEAR, denomDataset);
      const denomNum = parseFloat(denom);
      if (Number.isFinite(denomNum) && denomNum > 0) {
        numericValue = (numericValue / denomNum) * 100;
      } else {
        return { error: `Denominator ${share_of_variable_id} returned ${denom} — cannot compute share.` };
      }
    }

    // Run light validation (free-form vars don't have per-variable rules).
    // Pass the population already resolved during geo lookup so the count
    // sanity-check doesn't fire a second Census round-trip for B01003_001E.
    const validationWarning = await validateFreeFormResult(numericValue, unit, parsed.geoParams, censusApiKey, pickedPopulation);

    const formatted = formatValue(numericValue, share_of_variable_id ? "percent" : unit);

    const finalUnit = share_of_variable_id ? "percent" : unit;
    const sourceLabel = buildSourceLabel(dataset, CURRENT_ACS_YEAR);

    return {
      metric: label,
      value: formatted,
      raw_value: numericValue,
      unit: finalUnit,
      moe: numericMOE,
      table_id,
      location: parsed.locationLabel,
      source: `${sourceLabel}, U.S. Census Bureau`,
      dataset,
      ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
      ...(validationWarning ? { validation_warning: validationWarning } : {}),
      // Stripped before being forwarded to Claude — see runCensusTool.
      _sourceEntry: {
        kind: "stat",
        variableId: variable_id,
        variable: label,
        place: parsed.locationLabel,
        year: Number(CURRENT_ACS_YEAR),
        dataset,
        value: numericValue,
        moe: numericMOE,
        moeFormatted: null,
        unit: finalUnit,
        source: `${sourceLabel}, U.S. Census Bureau`,
        ...(fallbackReason ? { fallbackReason } : {}),
        tables: [{ tableId: table_id, url: buildCensusTableUrl(table_id, dataset, parsed.geoParams) }],
      },
    };
  } catch (err) {
    console.log(`[acs-var] FETCH ERROR: ${String(err?.message || err)}`);
    return { error: String(err?.message || "Failed to fetch Census variable.") };
  }
}

// Light sanity checks for free-form variables. We don't have per-variable
// bounds the way validateValue() does for the curated list, so we apply
// general rules and return a one-line warning string when something looks
// off (rather than dropping the result).
async function validateFreeFormResult(value, unit, geoParams, apiKey, knownPopulation = null) {
  if (!Number.isFinite(value)) return "Value is not a finite number — Census API may have returned a sentinel.";
  if (value < 0) return "Value is negative, which usually means the Census API returned a sentinel (e.g. -666666666 for suppressed cells).";
  if (unit === "percent" && (value < 0 || value > 100)) {
    return `Computed share is ${value.toFixed(2)}% — outside the 0–100 range. Verify the denominator.`;
  }
  if (unit === "index" && (value < 0 || value > 1)) {
    return `Index value ${value.toFixed(3)} is outside the typical 0–1 range.`;
  }
  if (unit === "number" && value > 0) {
    // For raw counts, sanity-check that we're not exceeding the geo's total
    // population. Reuse the population resolved during geo lookup when we have
    // it; only fall back to a live B01003_001E fetch when it's unknown.
    try {
      let totalPop = typeof knownPopulation === "number" ? knownPopulation : null;
      if (totalPop == null) {
        totalPop = parseFloat(await fetchCensusValue("B01003_001E", geoParams, apiKey));
      }
      if (Number.isFinite(totalPop) && totalPop > 0 && value > totalPop * 1.1) {
        return `Count (${Math.round(value).toLocaleString()}) exceeds the geography's total population (${Math.round(totalPop).toLocaleString()}). Verify this is the right variable.`;
      }
    } catch {
      // Pop lookup is optional — don't block.
    }
  }
  return null;
}

async function runCensusTool(toolInput) {
  const { metric, city, state } = toolInput;
  const query = city ? `${metric} in ${city}, ${state}` : `${metric} in ${state}`;

  const censusApiKey = process.env.CENSUS_API_KEY;
  if (!censusApiKey) {
    return { error: "Census API key not configured on server." };
  }

  try {
    const parsed = parseQuery(query);
    if (parsed.error) return { error: parsed.error };

    const { variable, geoParams, locationLabel } = parsed;
    // Prefer 1-Year, fall back to 5-Year only when 1-Year can't deliver — same
    // dataset-selection logic as the fast path and the free-form variable tool.
    const fetchResult = await fetchCensusValueWithMOEAndFallback(variable.id, geoParams, censusApiKey, {
      year: CURRENT_ACS_YEAR,
    });
    const rawValue = fetchResult.value;
    const rawMOE = fetchResult.moe;
    const dataset = fetchResult.dataset;
    const fallbackReason = fetchResult.fallbackReason || null;

    const rateResult = await computeRateIfNeeded(variable.id, rawValue, geoParams, censusApiKey, {
      year: CURRENT_ACS_YEAR,
      dataset: datasetPath(dataset),
      numeratorMOE: rawMOE,
    });
    const finalFormat = rateResult ? rateResult.format : variable.format;
    const finalValue = rateResult ? rateResult.value : rawValue;
    const finalMOE = rateResult ? rateResult.moe : rawMOE;
    const sourceLabel = buildSourceLabel(dataset, CURRENT_ACS_YEAR);

    // The `_sourceEntry` field is stripped before the result is forwarded to
    // Claude — it carries the raw, structured form of this fetch so the
    // chat handler can attach it to the response's `sources` trail. This is
    // how multi-place / Claude-mediated queries get the same "More info"
    // grounding panels the deterministic single-stat path already gets.
    return {
      metric: variable.label,
      value: formatValue(finalValue, finalFormat),
      moe: formatMOE(finalMOE, finalFormat),
      location: locationLabel,
      source: `${sourceLabel}, U.S. Census Bureau`,
      dataset,
      ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
      _sourceEntry: {
        kind: "stat",
        variableId: variable.id,
        variable: variable.label,
        place: locationLabel,
        year: Number(CURRENT_ACS_YEAR),
        dataset,
        value: parseFloat(finalValue),
        moe: finalMOE != null ? parseFloat(finalMOE) : null,
        moeFormatted: formatMOE(finalMOE, finalFormat),
        unit: finalFormat,
        source: `${sourceLabel}, U.S. Census Bureau`,
        ...(fallbackReason ? { fallbackReason } : {}),
        tables: buildGeoSourceTables(variable.id, dataset, geoParams),
      },
    };
  } catch (err) {
    // Ensure the error message is always a plain string — avoids JSON.stringify issues
    return { error: String(err?.message || "Failed to fetch Census data.") };
  }
}

// True when the user's message contains an explicit chart/graph word.
// Only used inside the statistic-mode fast path to opt into the chart route.
function wantsExplicitChart(text) {
  const lower = String(text || "").toLowerCase();
  return EXPLICIT_CHART_KEYWORDS.some((kw) => lower.includes(kw));
}

async function runTrendTool(toolInput) {
  try {
    // Call the trend logic in-process — no self-HTTP round-trip. runTrend
    // returns { status, body }; body is the same shape /api/trend serves:
    // { points, locationLabel, unit, variableId, variableLabel, tableId }.
    const { status, body } = await runTrend(toolInput || {});

    if (status !== 200) {
      return { error: body?.error || "Trend computation returned an error." };
    }
    if (!body || !Array.isArray(body.points)) {
      return { error: "Trend computation returned invalid response format." };
    }
    return body;
  } catch (err) {
    return { error: String(err?.message || "Failed to fetch trend data.") };
  }
}

// Categorical breakdown: fetch each bar's variable for one place in parallel,
// validate each claim, and emit a bar_chart payload sorted descending by value.
// Each bar also produces a _sourceEntry so the trail enrichment runs over them.
async function runBreakdownTool(toolInput) {
  const censusApiKey = process.env.CENSUS_API_KEY;
  if (!censusApiKey) return { error: "Census API key not configured on server." };

  const { location, title, bars, unit = "number", share_of_variable_id } = toolInput || {};
  if (!location || !title) {
    return { error: "Missing required fields: location and title." };
  }
  if (!Array.isArray(bars) || bars.length < 2) {
    return { error: "Pass at least 2 bars in the `bars` array." };
  }

  // Resolve geography. Mirrors the trend tool's path: parseQuery first
  // (fast for "City, State"), findGeoCandidates fallback for counties / CBSAs / ZCTAs.
  let geoParams = null, locationLabel = null, pickedPopulation = null, pickedGeoType = null;
  try {
    const parsed = parseQuery(`__placeholder__ in ${location}`);
    if (!parsed.error && parsed.geoParams && parsed.locationLabel) {
      geoParams = parsed.geoParams;
      locationLabel = parsed.locationLabel;
    }
  } catch {
    // fall through
  }
  if (!geoParams) {
    try {
      const phrase = String(location || "").trim();
      const lower = phrase.toLowerCase();
      // State-only shortcut
      if (STATE_FIPS[lower]) {
        geoParams = { forGeo: `state:${STATE_FIPS[lower]}` };
        locationLabel = phrase.replace(/\b\w/g, (c) => c.toUpperCase());
      } else {
        // City+state or county etc. Also handle "Austin Texas" / "Austin TX"
        // (no comma) by detecting a trailing state name/abbreviation.
        let namePart = phrase, statePart = null;
        if (phrase.includes(",")) {
          [namePart, statePart] = phrase.split(",").map((p) => p.trim());
        } else {
          const lower = phrase.toLowerCase();
          const words = lower.split(/\s+/);
          for (const len of [2, 1]) {
            const suffix = words.slice(-len).join(" ");
            if (suffix && STATE_FIPS[suffix]) {
              statePart = suffix;
              namePart = phrase.slice(0, phrase.length - suffix.length).trim();
              break;
            }
          }
        }
        const candidates = await findGeoCandidates(namePart, { stateName: statePart });
        if (candidates && candidates.length > 0) {
          const picked = candidates[0];
          geoParams = geoParamsFromCandidate(picked);
          locationLabel = candidateLabel(picked);
          pickedPopulation = typeof picked.population === "number" ? picked.population : null;
          pickedGeoType = picked.geoType || null;
        }
      }
    } catch {
      // fall through
    }
  }
  if (!geoParams) {
    return { error: `Couldn't resolve "${location}" to a Census geography.` };
  }

  // Validate every bar's variable claim before fetching anything. One bad
  // claim short-circuits the whole bar chart with a structured error so
  // Claude can revise its picks. (Same gate the variable tool uses.)
  for (const b of bars) {
    if (!b?.variable_id || !b?.label || !b?.table_id) {
      return { error: "Each bar requires variable_id, label, and table_id." };
    }
    if (!/^[A-Z]\d+_\d+[A-Z]?$/.test(String(b.variable_id).trim())) {
      return { error: `Invalid variable_id "${b.variable_id}" in bars[].` };
    }
    const validationError = await validateVariableClaim({
      variable_id: b.variable_id, label: b.label, table_id: b.table_id,
    });
    if (validationError) {
      return { error: validationError, kind: "variable_validation" };
    }
  }

  // Optional denominator validation (no validateVariableClaim — denominator
  // labels aren't user-facing, the variable_id is what matters).
  let denominator = null, denominatorDataset = null;
  if (share_of_variable_id) {
    if (!/^[A-Z]\d+_\d+[A-Z]?$/.test(String(share_of_variable_id).trim())) {
      return { error: `Invalid share_of_variable_id "${share_of_variable_id}".` };
    }
    try {
      // Use the same fallback-aware fetch the stat tool uses so 1-year is preferred.
      const denomResult = await fetchCensusValueWithMOEAndFallback(
        share_of_variable_id, geoParams, censusApiKey,
        { year: CURRENT_ACS_YEAR, population: pickedPopulation, geoType: pickedGeoType }
      );
      const denomNum = parseFloat(denomResult.value);
      if (!Number.isFinite(denomNum) || denomNum <= 0) {
        return { error: `Denominator ${share_of_variable_id} returned ${denomResult.value} — cannot compute shares.` };
      }
      denominator = denomNum;
      denominatorDataset = denomResult.dataset;
    } catch (err) {
      return { error: `Denominator fetch failed: ${String(err?.message || err)}` };
    }
  }

  // Fetch all bars in parallel. Each bar gets its own MOE-aware fallback fetch.
  const fetchOpts = { year: CURRENT_ACS_YEAR, population: pickedPopulation, geoType: pickedGeoType };
  const fetched = await Promise.all(bars.map(async (b) => {
    try {
      const r = await fetchCensusValueWithMOEAndFallback(
        b.variable_id, geoParams, censusApiKey, fetchOpts
      );
      const rawValue = parseFloat(r.value);
      if (!Number.isFinite(rawValue) || rawValue < 0) {
        return { ok: false, bar: b, reason: `No valid value for ${b.variable_id}` };
      }
      return {
        ok: true,
        bar: b,
        rawValue,
        moe: r.moe == null ? null : parseFloat(r.moe),
        dataset: r.dataset,
        fallbackReason: r.fallbackReason || null,
      };
    } catch (err) {
      return { ok: false, bar: b, reason: String(err?.message || err) };
    }
  }));

  const successes = fetched.filter((f) => f.ok);
  if (successes.length === 0) {
    return { error: "No bars returned valid data. Check variable IDs and geography." };
  }

  // Compose the bar list. If share_of, value = (raw / denom) * 100 → percent.
  const finalUnit = share_of_variable_id ? "percent" : (unit || "number");
  const renderedBars = successes.map((f) => {
    let value = f.rawValue;
    if (share_of_variable_id && denominator) {
      value = (f.rawValue / denominator) * 100;
    }
    return {
      label: f.bar.label,
      value,
      moe: f.moe,
      variableId: f.bar.variable_id,
      tableId: f.bar.table_id,
      dataset: f.dataset,
    };
  });

  // Pick a friendly source label. If all bars came from the same dataset, use
  // that. Otherwise (rare — happens when one variable falls back to 5-year and
  // another stays on 1-year) fall back to the most common.
  const datasetCounts = renderedBars.reduce((acc, b) => {
    acc[b.dataset] = (acc[b.dataset] || 0) + 1;
    return acc;
  }, {});
  const dominantDataset = Object.keys(datasetCounts).reduce(
    (a, b) => (datasetCounts[a] >= datasetCounts[b] ? a : b),
    "acs5"
  );
  const sourceLabel = buildSourceLabel(dominantDataset, CURRENT_ACS_YEAR) + ", U.S. Census Bureau";

  // Total label (for share-of context line under the title).
  let totalLabel = null;
  if (finalUnit === "percent" && denominator) {
    totalLabel = `Total (denominator): ${formatValue(denominator, "number")}`;
  } else if (finalUnit === "number") {
    const sum = renderedBars.reduce((acc, b) => acc + b.value, 0);
    totalLabel = `Sum across categories: ${formatValue(sum, "number")}`;
  }

  // Per-bar _sourceEntry, accumulated into a single field on the result so
  // the loop's strip-and-collect pass picks them all up.
  const sourceEntries = renderedBars.map((b) => ({
    kind: "stat",
    variableId: b.variableId,
    variable: b.label,
    place: locationLabel,
    year: Number(CURRENT_ACS_YEAR),
    dataset: b.dataset,
    value: b.value,
    moe: b.moe,
    moeFormatted: formatMOE(b.moe, finalUnit),
    unit: finalUnit,
    source: buildSourceLabel(b.dataset, CURRENT_ACS_YEAR) + ", U.S. Census Bureau",
    tables: [{ tableId: b.tableId, url: buildCensusTableUrl(b.tableId, b.dataset, geoParams) }],
  }));

  // Surface whether all bars came from the same vintage so the chart's
  // lede can phrase the methodology line truthfully ("1-year ACS sample"
  // for a place ≥65k where every bar was 1-year, "5-year" otherwise,
  // "mixed" if one bar fell back).
  const distinctDatasets = Object.keys(datasetCounts);
  const mixedDatasets = distinctDatasets.length > 1;

  return {
    type: "bar_chart",
    metric: title,
    location: locationLabel,
    unit: finalUnit,
    year: Number(CURRENT_ACS_YEAR),
    dataset: dominantDataset,                  // "acs1" or "acs5"
    mixedDatasets,                             // true if any bar fell back
    bars: renderedBars,
    source: sourceLabel,
    totalLabel,
    sortDescending: true,
    _sourceEntries: sourceEntries,
  };
}

function getLatestUserMessage(messages) {
  return messages
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .slice(-1)[0]?.content || "";
}

function inferTrendMetricLabel(userMessage) {
  const text = String(userMessage || "").trim();
  if (!text) return "Trend";

  const parsed = parseQuery(text);
  if (!parsed?.error && parsed.variable?.label) {
    return parsed.variable.label;
  }

  const lower = text.toLowerCase();
  const keywordMatch = QUERY_TYPES.find((metric) => lower.includes(metric.toLowerCase()));
  if (keywordMatch) {
    return toTitleCase(keywordMatch);
  }

  return "Trend";
}

function buildTrendChartPayload(trendSeries, metricLabel, seriesWarnings = [], { overrideLocation = null, singlePlace = false } = {}) {
  // trendSeries: [{ label, varLabel?, points: [{year, numericValue}] }]
  const allYears = trendSeries.flatMap((s) => s.points.map((p) => p.year));
  const yearRange = allYears.length
    ? `${Math.min(...allYears)}–${Math.max(...allYears)}`
    : "";

  // De-duplicate warnings — when multiple cities trigger the same concept-shift
  // detection (typically because the variable's redefinition affects every
  // geography), we only want to show the banner once.
  const uniqueWarnings = [];
  const seen = new Set();
  for (const w of seriesWarnings) {
    if (!w) continue;
    const key = `${w.kind}:${w.year}:${w.prevYear}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueWarnings.push(w);
  }

  // When overrideLocation is set (multi-variable, single place), the series
  // labels are already the variable names — use the place name as the chart
  // location subtitle instead of joining the series labels.
  const location = overrideLocation || trendSeries.map((s) => s.label).join(" vs ");

  return {
    type: "trend_chart",
    chartType: trendSeries.length > 1 ? "multi_line" : "line",
    metric: metricLabel || "Trend",
    location,
    // singlePlace=true tells TrendChart to say "Comparing N measures" instead
    // of "Comparing N places" in the multi-series lede.
    ...(singlePlace ? { singlePlace: true } : {}),
    series: trendSeries.map((s) => ({
      label: s.label,
      points: s.points.map((p) => ({
        year: Number(p.year),
        numericValue: Number(p.numericValue),
      })),
    })),
    source: yearRange
      ? `U.S. Census Bureau ACS 5-Year Estimates (${yearRange})`
      : "U.S. Census Bureau ACS 5-Year Estimates",
    ...(uniqueWarnings.length > 0 ? { seriesWarnings: uniqueWarnings } : {}),
  };
}

function chartErrorPayload() {
  return {
    type: "error",
    message: "Unable to generate chart data.",
  };
}

// ── Statistic mode fast path (no agentic loop) ──────────────────────────────

function buildDeterministicSentence(place, variable, numericValue, format, year) {
  const formatted = formatValue(numericValue, format);
  return `${place} had a ${variable.toLowerCase()} of ${formatted} in ${year}.`;
}

// Census API path for a dataset key, mapped from our short name.
function datasetPath(dataset) {
  return dataset === "acs1" ? "acs/acs1" : "acs/acs5";
}

// True when the user's geo phrase looks like a "zip NNNNN" reference
// (so we should give a ZIP-specific message rather than the general one).
function isZipQuirk(geoPhrase) {
  if (!geoPhrase?.name) return false;
  return /^(zip|zcta)\s+\d{5}$/i.test(geoPhrase.name.trim()) ||
         /^\d{5}$/.test(geoPhrase.name.trim());
}

// Friendly prompt shown when a user's location doesn't match any ACS geography.
function buildAcsQuirkPrompt(geoPhrase) {
  if (isZipQuirk(geoPhrase)) {
    const zip = (geoPhrase.name.match(/\d{5}/) || [])[0] || geoPhrase.name;
    return [
      `**ZIP ${zip}** isn't published as a ZCTA in ACS data.`,
      ``,
      `This usually happens for ZIPs that are single-organization codes (P.O. boxes or company-internal mail like GE's 12345 in Schenectady). The Census Bureau only tabulates residential ZCTAs.`,
      ``,
      `Try a residential ZIP nearby, or use the city or county name instead.`,
    ].join("\n");
  }
  const where = geoPhrase.state ? `${geoPhrase.name}, ${geoPhrase.state}` : geoPhrase.name;
  const stateClause = geoPhrase.state || "<state>";
  const bareName = geoPhrase.name.replace(/\s+(county|parish|census area)$/i, "").trim();
  return [
    `I couldn't find **"${where}"** in ACS data. It may be misspelled, or the Census Bureau may not publish data for it at the place level.`,
    ``,
    `Things to try:`,
    `- Double-check the spelling of the city or county name`,
    `- For counties, include the word County — e.g. **"${bareName} County, ${stateClause}"**`,
    `- For metro areas, try **"${geoPhrase.name} metro"**`,
    `- For ZIP codes, try **"in zip 12345"**`,
    `- For state-level data, just use the state name`,
  ].join("\n");
}

// Prompt shown when the user mentioned a place ACS knows but a metric ACS doesn't.
function buildMetricNotRecognizedPrompt() {
  return [
    `I couldn't tell which ACS metric you're asking about.`,
    ``,
    `Supported metrics: population, median household income, per capita income, median family income, median rent, median home value, total housing units, median age, mean travel time, poverty rate, unemployment rate, employment rate, labor force participation, bachelor's degree, high school graduation rate, graduate degree.`,
    ``,
    `Try rephrasing with one of those.`,
  ].join("\n");
}

// Direct lookup when the user has an explicit geo (picked or auto-defaulted).
// Bypasses parseQuery's geo logic — uses FIPS codes from the candidate object directly.
// Returns { reply, structured } | { error } | null (null = caller should fall back).
async function performPickedLookup({ pickedGeo, pickedMetric, userMsg }) {
  const censusApiKey = process.env.CENSUS_API_KEY;
  if (!censusApiKey) {
    return { error: "Server configuration error: missing Census API key." };
  }

  // Resolve the metric: prefer pickedMetric, else parse from userMsg.
  // Use parseVariableOnly so we don't reject the message just because the
  // geo phrase isn't a city/state (e.g. ZCTA queries: "in zip 90210").
  let variable;
  if (pickedMetric?.variableId && pickedMetric?.label && pickedMetric?.format) {
    variable = {
      id: pickedMetric.variableId,
      label: pickedMetric.label,
      format: pickedMetric.format,
    };
  } else {
    const v = parseVariableOnly(userMsg);
    if (!v) return null; // no recognizable metric — fall through
    variable = v;
  }

  // Resolve the geo: prefer pickedGeo, else fall through
  let geoParams, locationLabel;
  if (pickedGeo) {
    geoParams = geoParamsFromCandidate(pickedGeo);
    if (!geoParams) return null;
    locationLabel = candidateLabel(pickedGeo);
  } else {
    const parsed = parseQuery(userMsg);
    if (parsed.error || !parsed.geoParams) return null;
    geoParams = parsed.geoParams;
    locationLabel = parsed.locationLabel;
  }

  let fetchResult;
  try {
    fetchResult = await fetchCensusValueWithMOEAndFallback(variable.id, geoParams, censusApiKey, {
      year: CURRENT_ACS_YEAR,
      population: typeof pickedGeo?.population === "number" ? pickedGeo.population : null,
      geoType: pickedGeo?.geoType || null,
    });
  } catch (err) {
    return { error: String(err?.message || "Failed to fetch Census data.") };
  }

  const rawValue = fetchResult.value;
  const rawMOE = fetchResult.moe;
  const dataset = fetchResult.dataset;
  const fallbackReason = fetchResult.fallbackReason || null;

  let numericValue = rawValue;
  let numericMOE = rawMOE;
  let format = variable.format;
  try {
    const rateResult = await computeRateIfNeeded(variable.id, rawValue, geoParams, censusApiKey, {
      year: CURRENT_ACS_YEAR,
      dataset: datasetPath(dataset),
      numeratorMOE: rawMOE,
    });
    if (rateResult) {
      numericValue = rateResult.value;
      numericMOE = rateResult.moe;
      format = rateResult.format;
    }
  } catch {
    // Rate computation failure is non-fatal — use raw value
  }

  const formatted = formatValue(numericValue, format);
  const formattedMOE = formatMOE(numericMOE, format);
  const sourceLabel = buildSourceLabel(dataset, CURRENT_ACS_YEAR);
  const sentence = formattedMOE
    ? `${locationLabel} had a ${variable.label.toLowerCase()} of ${formatted} (${formattedMOE}) in ${CURRENT_ACS_YEAR}.`
    : `${locationLabel} had a ${variable.label.toLowerCase()} of ${formatted} in ${CURRENT_ACS_YEAR}.`;

  return {
    reply: sentence,
    structured: {
      value: numericValue,
      moe: numericMOE,
      moeFormatted: formattedMOE,
      variable: variable.label,
      place: locationLabel,
      year: Number(CURRENT_ACS_YEAR),
      unit: format,
      geoType: pickedGeo?.geoType || "place",
      dataset,
      source: sourceLabel,
      tables: buildGeoSourceTables(variable.id, dataset, geoParams),
      ...(fallbackReason ? { fallbackReason } : {}),
    },
  };
}

// Equality check for two geo candidates so we can exclude the active pick from chips.
function sameCandidate(a, b) {
  if (!a || !b || a.geoType !== b.geoType) return false;
  switch (a.geoType) {
    case "place":              return a.placeFips === b.placeFips && a.stateFips === b.stateFips;
    case "county":             return a.countyFips === b.countyFips && a.stateFips === b.stateFips;
    case "county_subdivision": return a.cousubFips === b.cousubFips && a.stateFips === b.stateFips;
    case "cbsa":               return a.cbsaFips === b.cbsaFips;
    case "urban_area":         return a.uaFips === b.uaFips;
    case "zcta":               return a.name === b.name;
    case "state":              return a.stateFips === b.stateFips;
    default: return false;
  }
}

// County-style suffixes that the user might type but that aren't part of
// the bare county name in Census data (e.g. "Cook County" → "Cook").
const COUNTY_LIKE_SUFFIX_RE = /\s+(county|parish|census area)$/i;

// Resolve a ZIP/ZCTA from the user message. Two triggers, single source of truth:
// (1) the geo phrase is shaped like a ZIP — bare "60618" or "zip 60618" /
//     "zcta 60618" (catches "rent in 60618" with no explicit keyword).
// (2) the message has a "zip"/"zcta" keyword + a 5-digit number anywhere —
//     catches forms with no extractable " in <phrase>" like "Tell me about ZIP 60618".
// Returns { candidate, zip } or null. Null on either no-match or an unpublished
// ZCTA — the quirk prompt downstream explains unpublished ZIPs accurately.
async function tryResolveZcta(userMsg, geoName) {
  const stripped = String(geoName || "").trim().replace(/^(zip|zcta)\s+/i, "").trim();
  const phraseMatch = stripped.match(/^(\d{5})$/);
  if (phraseMatch) {
    const candidate = await findZctaByZip(phraseMatch[1]).catch(() => null);
    if (candidate) return { candidate, zip: phraseMatch[1] };
  }
  const zipMatch = String(userMsg || "").match(/\b(\d{5})\b/);
  if (zipMatch && /\b(zip|zcta)\b/i.test(userMsg)) {
    const candidate = await findZctaByZip(zipMatch[1]).catch(() => null);
    if (candidate) return { candidate, zip: zipMatch[1] };
  }
  return null;
}

// Detect ambiguity in the query without halting — returns defaults + raw data so
// the caller can both run the best-guess lookup AND surface the other interpretations
// as clickable alternatives.
async function detectAlternatives(userMsg, { skipMetricCheck = false } = {}) {
  const out = { metric: null, geo: null };

  const ambiguous = skipMetricCheck ? null : detectAmbiguousMetric(userMsg);
  if (ambiguous) {
    const defaultOpt = ambiguous.options[0];
    out.metric = {
      bucket: ambiguous.bucket,
      allOptions: ambiguous.options,
      defaultMetric: {
        variableId: defaultOpt.id,
        label: defaultOpt.label,
        table: defaultOpt.table,
        format: defaultOpt.format,
      },
    };
  }

  const geo = extractGeoPhrase(userMsg);

  // Single ZCTA resolution step — covers both the phrase-shape case (bare
  // "60618" or "zip 60618") and the keyword-anywhere case ("Tell me about
  // ZIP 60618"). The helper returns null when the ZIP isn't a published
  // residential ZCTA, so those fall through to the quirk prompt for an
  // accurate explanation.
  const zcta = await tryResolveZcta(userMsg, geo?.name);
  if (zcta) {
    out.geo = {
      name: zcta.zip,
      stateName: null,
      candidates: [zcta.candidate],
      types: new Set(["zcta"]),
      defaultGeo: zcta.candidate,
    };
    return out;
  }

  if (!geo?.name) return out;

  const lowerName = geo.name.toLowerCase();
  // State-only query → handled by parseQuery directly, no candidates needed
  if (geo.state == null && STATE_FIPS[lowerName]) return out;

  // Try the literal name first; if that misses AND the name has a county-like
  // suffix ("Cook County"), retry with the suffix stripped so we hit the
  // county fetcher's bare names.
  let candidates = await findGeoCandidates(geo.name, { stateName: geo.state || null }).catch(() => null);
  let userTypedCountySuffix = false;
  if (COUNTY_LIKE_SUFFIX_RE.test(geo.name)) {
    userTypedCountySuffix = true;
    if (!candidates || candidates.length === 0) {
      const stripped = geo.name.replace(COUNTY_LIKE_SUFFIX_RE, "").trim();
      candidates = await findGeoCandidates(stripped, { stateName: geo.state || null }).catch(() => null);
    }
  }

  // Use any candidates we found — even a single one. parseQuery's place_filter
  // path doesn't catch CDPs whose Census name has a prefix (e.g. "Urban Honolulu"),
  // so preferring geoCandidates whenever it returns ≥1 hit makes more queries land.
  if (candidates && candidates.length > 0) {
    // When the user explicitly typed "X County", prefer the county candidate
    // over any same-name place (Maricopa County, AZ vs. Maricopa city, AZ).
    let defaultGeo = candidates[0];
    if (userTypedCountySuffix) {
      const county = candidates.find((c) => c.geoType === "county");
      if (county) defaultGeo = county;
    }
    out.geo = {
      name: geo.name,
      stateName: geo.state,
      candidates,
      types: new Set(candidates.map((c) => c.geoType)),
      defaultGeo,
    };
  }

  return out;
}

// Strip a leading "[Picked X]" marker from a query so chip values don't stack
// the marker across compounding clicks.
function stripPickedPrefix(msg) {
  return String(msg || "").replace(/^\s*\[Picked [^\]]+\]\s*/i, "");
}

// Build a chip payload for metric alternatives, excluding the currently active pick.
// Each chip's meta carries previously-resolved picks so they compound across clicks.
function buildMetricAltPayload(metricAmb, userMsg, activeMetricId, extraMeta = {}) {
  const others = metricAmb.allOptions.filter((o) => o.id !== activeMetricId);
  if (others.length === 0) return null;
  const cleanMsg = stripPickedPrefix(userMsg);
  return {
    kind: "metric",
    prompt: `Did you mean a different "${metricAmb.bucket}" measure?`,
    options: others.map((opt) => ({
      label: opt.label,
      sublabel: `${opt.description} (Table ${opt.table})`,
      value: `${opt.label.toLowerCase()} ${cleanMsg.replace(new RegExp(`\\b${metricAmb.bucket}\\b`, "i"), "").trim()}`.replace(/\s+/g, " "),
      meta: {
        ...extraMeta,
        pickedMetric: {
          variableId: opt.id,
          label: opt.label,
          table: opt.table,
          format: opt.format,
        },
      },
    })),
    originalQuery: userMsg,
  };
}

// Build a chip payload for geo alternatives, excluding the currently active pick.
function buildGeoAltPayload(geoAmb, userMsg, activeGeo, extraMeta = {}) {
  const others = geoAmb.candidates.filter((c) => !sameCandidate(c, activeGeo)).slice(0, 8);
  if (others.length === 0) return null;
  const useIcon = geoAmb.types.size > 1;
  const cleanMsg = stripPickedPrefix(userMsg);
  const prompt = geoAmb.stateName == null
    ? `Did you mean a different "${geoAmb.name}"?`
    : geoAmb.types.size > 1
      ? `Did you mean a different scope for "${geoAmb.name}"?`
      : `Did you mean a different "${geoAmb.name}" in ${geoAmb.stateName}?`;
  return {
    kind: "geography",
    prompt,
    options: others.map((c) => {
      const d = describeCandidate(c);
      return {
        label: useIcon && d.icon ? `${d.icon} ${d.label}` : d.label,
        sublabel: d.sublabel,
        value: `[Picked ${candidateLabel(c)}] ${cleanMsg}`,
        meta: { ...extraMeta, pickedGeo: c },
      };
    }),
    originalQuery: userMsg,
  };
}

async function handleStatisticModeFastPath(req, res, userMsg, mode, opts = {}) {
  const censusApiKey = process.env.CENSUS_API_KEY;
  if (!censusApiKey) {
    return res.status(500).json({ error: "Server configuration error: missing Census API key." });
  }

  const { pickedGeo = null, pickedMetric = null } = opts;
  const skipMetricCheck = !!pickedMetric;

  // Strip the "[Picked X] ..." chip prefix BEFORE any geo / metric extraction.
  // The prefix's label can contain " in " (e.g. "Income in the past 12 months below
  // poverty level"), which would otherwise hijack extractGeoPhrase's first-" in "
  // split and resolve the wrong location. The prefix is only there for display;
  // pickedMetric/pickedGeo carry the actual override.
  userMsg = stripPickedPrefix(userMsg);

  // "median rent by ZIP code (60618)" → "median rent in 60618"
  // Metric parsers tokenize the full query when no separator is found, so extra
  // tokens break the exact-length match. This normalization fires only when a
  // 5-digit ZIP appears after "by zip/zcta" — grouping queries like "population
  // by race in Texas" are unaffected (no bare 5-digit number).
  userMsg = userMsg.replace(
    /\bby\s+(?:zip(?:\s+code)?|zcta)\s*\(?(\d{5})\)?/gi,
    (_, zip) => `in ${zip}`
  );

  // Detect ambiguity but DO NOT halt — we'll always run the best-guess lookup
  // and surface the other interpretations as clickable alternatives.
  const ambiguity = await detectAlternatives(userMsg, { skipMetricCheck });

  // Effective picks: user's pick wins; otherwise fall back to the auto-default.
  const activeMetric = pickedMetric || ambiguity.metric?.defaultMetric || null;
  const activeGeo = pickedGeo || ambiguity.geo?.defaultGeo || null;

  // Build alternative chips for axes the user hasn't already explicitly picked.
  // Each chip carries the OTHER active pick in its meta so picks compound across clicks.
  const alternatives = [];
  if (ambiguity.metric && !pickedMetric) {
    const extraMeta = activeGeo ? { pickedGeo: activeGeo } : {};
    const p = buildMetricAltPayload(ambiguity.metric, userMsg, activeMetric?.variableId, extraMeta);
    if (p) alternatives.push(p);
  }
  if (ambiguity.geo && !pickedGeo) {
    const extraMeta = activeMetric ? { pickedMetric: activeMetric } : {};
    const p = buildGeoAltPayload(ambiguity.geo, userMsg, activeGeo, extraMeta);
    if (p) alternatives.push(p);
  }

  // Note: previously this branch pushed auto-derived "related measures" chips
  // for any resolved variable (race × Hispanic, income variants, etc.). Removed
  // by user request — chips should only surface when there's a GENUINE risk
  // the user misunderstood the stat (i.e. the hand-written AMBIGUOUS_METRICS
  // buckets above and the geo-candidate chips).

  const altsField = alternatives.length > 0 ? { alternatives } : {};

  // Up-front metric check: if no metric can be resolved (no pick, no ambiguity
  // default, no VARIABLE_MAP match), defer to the agentic loop. Claude has
  // lookup_census_variable for any ACS variable not in the curated map, plus
  // light server-side validation of free-form results — so this is now the
  // intended path for long-tail queries (race × age, language at home, etc.).
  const metricResolved = !!(activeMetric || parseVariableOnly(userMsg));
  if (!metricResolved) return null;

  // Path 1: chart route — runs only when the user *explicitly* asked for a
  // chart/graph (e.g. "rent chart for Austin"). Statistic mode is otherwise
  // a numbers-only mode; this is the single allowed opt-in into the chart
  // tool. Only fires when parseQuery also resolves a clear geo.
  if (wantsExplicitChart(userMsg)) {
    const parsed = parseQuery(userMsg);
    const metricLabel = inferTrendMetricLabel(userMsg);

    if (!parsed.error && parsed.locationLabel) {
      const endYear = Number(CURRENT_ACS_YEAR);
      const trendResult = await runTrendTool({
        location: parsed.locationLabel,
        metric: metricLabel,
        startYear: endYear - 4,
        endYear,
      });

      if (trendResult && Array.isArray(trendResult.points)) {
        const resolvedLabel = trendResult.locationLabel || parsed.locationLabel;
        const series = [{
          label: resolvedLabel,
          points: trendResult.points
            .filter(p => p.numericValue != null)
            .map(p => ({ year: Number(p.year), numericValue: Number(p.numericValue) })),
        }];
        const payload = buildTrendChartPayload(
          series,
          metricLabel,
          trendResult.seriesWarning ? [trendResult.seriesWarning] : []
        );
        const warnings = trendResult.points.filter(p => p.warning).map(p => `${p.year}: ${p.warning}`);

        // Same sourcing trail the stat path produces — table-catalog
        // grounding, MOE methodology (null for trend, since trend.js
        // doesn't fetch MOEs today), and a methodology citation from
        // the handbook RAG. Use the canonical variable identity echoed
        // by /api/trend so the source entry doesn't re-resolve via
        // parseQuery (which can drop disambiguation).
        const trendSources = [];
        const trendEntry = buildTrendSourceEntry({
          location: resolvedLabel,
          metric: metricLabel,
          points: series[0].points,
          variableId: trendResult.variableId,
          variableLabel: trendResult.variableLabel,
          unit: trendResult.unit,
          tableId: trendResult.tableId,
        });
        if (trendEntry) {
          await attachNuancesAndMethodology(trendEntry, trendEntry.variableId);
          trendSources.push(trendEntry);
        }

        return res.status(200).json({
          reply: JSON.stringify(payload),
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(trendSources.length > 0 ? { sources: trendSources } : {}),
          ...altsField,
        });
      }
    }
    // Trend routing couldn't proceed — try the explicit-geo or standard path below.
  }

  // Path 2: explicit geo (from pickedGeo or default candidate) → FIPS-based lookup.
  if (activeGeo) {
    const result = await performPickedLookup({ pickedGeo: activeGeo, pickedMetric: activeMetric, userMsg });
    if (result?.reply) {
      // Surface population from the picked candidate so banners can tailor
      // the small-place 5-year wording.
      if (result.structured && typeof activeGeo.population === "number") {
        result.structured.population = activeGeo.population;
      }
      const variableId = result.structured?.variableId
        || activeMetric?.variableId
        || parseVariableOnly(userMsg)?.id;
      await attachNuancesAndMethodology(result.structured, variableId);
      return res.status(200).json({
        ...result,
        ...altsField,
      });
    }
    if (result?.error) {
      return res.status(200).json({ reply: null, error: result.error, warning: true });
    }
    // result === null → couldn't resolve metric/geo, fall through
  }

  // Path 3: standard parseQuery → fetch.
  const parsed = parseQuery(userMsg);
  if (parsed.error) {
    // If the user mentioned an "in <name>" but neither parseQuery nor the
    // geoCandidates search resolved it, that's an ACS-quirk case — give a
    // helpful prompt instead of falling through to the agentic loop (which
    // can hallucinate without a real lookup).
    const geoPhrase = extractGeoPhrase(userMsg);
    if (geoPhrase?.name) {
      return res.status(200).json({
        reply: buildAcsQuirkPrompt(geoPhrase, userMsg),
        ...altsField,
      });
    }
    return null; // truly off-topic — let the agentic loop respond
  }

  // If user picked a metric, override parseQuery's variable.
  const variable = activeMetric
    ? { id: activeMetric.variableId, label: activeMetric.label, format: activeMetric.format }
    : parsed.variable;
  const { geoParams, locationLabel } = parsed;

  let fetchResult;
  try {
    fetchResult = await fetchCensusValueWithMOEAndFallback(variable.id, geoParams, censusApiKey, {
      year: CURRENT_ACS_YEAR,
    });
  } catch (err) {
    const errMsg = String(err?.message || "Failed to fetch Census data.");
    // "Couldn't find X in Census place data" means the user-typed place name
    // didn't match anything in ACS. Show the quirk prompt instead of a raw error.
    if (/Couldn't find/i.test(errMsg)) {
      const geoPhrase = extractGeoPhrase(userMsg);
      if (geoPhrase?.name) {
        return res.status(200).json({
          reply: buildAcsQuirkPrompt(geoPhrase, userMsg),
          ...altsField,
        });
      }
    }
    return res.status(200).json({ reply: null, error: errMsg, warning: true });
  }

  let rawValue = fetchResult.value;
  let rawMOE = fetchResult.moe;
  let dataset = fetchResult.dataset;
  let fallbackReason = fetchResult.fallbackReason || null;

  let validationFailed = false;
  const firstValidation = validateValue(variable.id, rawValue);
  if (!firstValidation.ok) {
    validationFailed = true;
    try {
      const retry = await fetchCensusValueWithMOEAndFallback(variable.id, geoParams, censusApiKey, {
        year: CURRENT_ACS_YEAR,
      });
      const retryValidation = validateValue(variable.id, retry.value);
      if (!retryValidation.ok) {
        return res.status(200).json({
          reply: null,
          error: `Unable to retrieve validated data: ${retryValidation.reason}`,
          warning: true,
        });
      }
      rawValue = retry.value;
      rawMOE = retry.moe;
      dataset = retry.dataset;
      fallbackReason = retry.fallbackReason || null;
      validationFailed = false;
    } catch (retryErr) {
      return res.status(200).json({ reply: null, error: String(retryErr?.message || "Retry failed."), warning: true });
    }
  }

  let numericValue = rawValue;
  let numericMOE = rawMOE;
  let format = variable.format;
  try {
    const rateResult = await computeRateIfNeeded(variable.id, rawValue, geoParams, censusApiKey, {
      year: CURRENT_ACS_YEAR,
      dataset: datasetPath(dataset),
      numeratorMOE: rawMOE,
    });
    if (rateResult) {
      numericValue = rateResult.value;
      numericMOE = rateResult.moe;
      format = rateResult.format;
    }
  } catch {
    // Rate computation failure is non-fatal — use raw value
  }

  const warnings = [];
  if (validationFailed) warnings.push("Data required a retry — treat with caution.");

  const formattedMOE = formatMOE(numericMOE, format);
  let sentence = buildDeterministicSentence(locationLabel, variable.label, numericValue, format, CURRENT_ACS_YEAR);
  if (formattedMOE) sentence = sentence.replace(/\.$/, ` (${formattedMOE}).`);

  const structured = {
    value: numericValue,
    moe: numericMOE,
    moeFormatted: formattedMOE,
    variable: variable.label,
    place: locationLabel,
    year: Number(CURRENT_ACS_YEAR),
    unit: format,
    dataset,
    source: buildSourceLabel(dataset, CURRENT_ACS_YEAR),
    tables: buildGeoSourceTables(variable.id, dataset, geoParams),
    ...(fallbackReason ? { fallbackReason } : {}),
  };
  await attachNuancesAndMethodology(structured, variable.id);

  return res.status(200).json({
    reply: sentence,
    structured,
    warnings,
    validated: !validationFailed,
    ...altsField,
  });
}

// 20 requests per minute per IP — protects the Anthropic + Census API budget.
const chatRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 20 });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = chatRateLimiter(req);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  const { messages, mode, pickedGeo, pickedMetric } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided." });
  }

  // Cap conversation history size to prevent context exhaustion attacks.
  const MAX_MESSAGES = 50;
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: "Too many messages in conversation history." });
  }

  // Cap individual message content length to prevent oversized prompts.
  const MAX_MSG_LENGTH = 4000;
  for (const m of messages) {
    if (typeof m.content === "string" && m.content.length > MAX_MSG_LENGTH) {
      return res.status(400).json({ error: "Message content too long." });
    }
  }

  // Hard cap on total conversation size to prevent context exhaustion.
  const MAX_TOTAL_CHARS = 100_000;
  const totalChars = messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return res.status(400).json({ error: "Conversation history is too large." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server configuration error: missing Anthropic API key." });
  }

  try {
    const initialUserMsg = getLatestUserMessage(messages);

    // Statistic mode: deterministic fast path. Always returns a best-guess
    // result (auto-defaulting on ambiguity) plus an `alternatives` payload
    // listing the other interpretations the user can click. Falls through to
    // the agentic loop only when parseQuery can't resolve the query at all.
    //
    // Multi-turn deferral: the fast path is single-turn / context-free. Once
    // the conversation has any prior assistant turn, defer to Claude so it can
    // use the conversation context. Exception: chip clicks (pickedGeo /
    // pickedMetric) always go through the fast path because they're already
    // pre-resolved choices that don't need conversation context.
    const hasPriorAssistantTurn = messages.some(m => m.role === "assistant");
    const hasChipPick = !!(pickedGeo || pickedMetric);
    const useFastPath = mode === "statistic" && (!hasPriorAssistantTurn || hasChipPick);

    if (useFastPath) {
      const fastPathResult = await handleStatisticModeFastPath(req, res, initialUserMsg, mode, {
        pickedGeo,
        pickedMetric,
      });
      if (fastPathResult !== null) return fastPathResult;
    }

    let currentMessages = messages;
    let finalReply = null;
    const trendSeries = []; // collected across tool calls for multi-line comparisons
    // Concept-shift warnings raised by /api/trend's series-level detection.
    // De-duplicated downstream in buildTrendChartPayload.
    const trendSeriesWarnings = [];
    // Captures the canonical variable label echoed by /api/trend so multi-
    // series free-form trends display the right chart title (otherwise
    // inferTrendMetricLabel falls back to "Trend" for variables outside
    // VARIABLE_MAP — e.g. "Vietnamese Alone").
    let lastTrendVariableLabel = null;
    // Captures the most recent successful breakdown bar-chart payload so the
    // visualize-mode end-of-loop emits it as the chart reply.
    let lastBarChart = null;
    // Sources trail: every successful stat fetch during the agentic loop is
    // captured here so the response can surface "More information / sourcing"
    // grounding regardless of which UI shape is rendered (single StatCard,
    // multi-place comparison prose, learn-mode essay, etc.).
    const sources = [];
    // Captures the most recent successful free-form variable lookup so we can
    // surface it as a StatCard alongside Claude's text reply. If Claude calls
    // the tool more than once in a turn, the last successful result wins.
    let acsVariableStructured = null;
    // Derived alternatives chip payload from the most recent successful free-form
    // variable lookup. Same shape AlternativesBlock already consumes for income/etc.
    let acsVariableAlternatives = null;
    const loopDeadline = Date.now() + LOOP_TIMEOUT_MS;
    // Output contract: visualize mode always produces a chart. Auto mode emits
    // a chart when Claude called trend/breakdown tools; statistic/learn never
    // produce charts unless the user explicitly requested one via keywords.
    const visualizationRequest = mode === "visualize";

    for (let i = 0; i < 5; i++) {
      // Enforce total loop timeout
      const remaining = loopDeadline - Date.now();
      if (remaining <= 0) {
        return res.status(504).json({ error: "The response took too long. The AI service may be busy, please try again in a moment." });
      }

      const latestUserMsg = getLatestUserMessage(currentMessages);
      const systemPrompt = buildSystemPrompt(latestUserMsg, mode);

      // Force Claude to use a tool on the FIRST iteration of statistic mode
      // when the user's message contains a location phrase. This prevents the
      // failure mode where Claude would silently answer specific Census numbers
      // from training data instead of calling a tool. After iteration 0 we
      // revert to auto so Claude can write the final text reply.
      const userMsgForGate = getLatestUserMessage(currentMessages);
      const looksLikeDataQuestion = (mode === "statistic" || mode === "auto")
        && i === 0
        && !!extractGeoPhrase(userMsgForGate);
      const toolChoice = looksLikeDataQuestion
        ? { type: "any" }
        : { type: "auto" };

      // Race the Claude call against the remaining timeout budget.
      // createMessageWithRetry handles transient Anthropic 529 overloads internally.
      const responsePromise = createMessageWithRetry({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: [CENSUS_TOOL, ACS_VARIABLE_TOOL, TREND_TOOL, BREAKDOWN_TOOL, ACS_DOCS_TOOL],
        tool_choice: toolChoice,
        messages: currentMessages,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The response took too long. The AI service may be busy, please try again in a moment.")), remaining)
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      const toolsCalled = response.content.filter(b => b.type === "tool_use").map(b => b.name);
      console.log(`[chat] loop iteration ${i}, stop_reason=${response.stop_reason}, tool_choice=${JSON.stringify(toolChoice)}, tools_called=[${toolsCalled.join(",")}]`);

      if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
        const textBlock = response.content.find(b => b.type === "text");
        finalReply = stripEmDashes(textBlock ? textBlock.text : null);
        if (!finalReply && response.stop_reason === "max_tokens") {
          finalReply = "Response was cut off. Try asking a more specific question.";
        }
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            let result;
            if (block.name === TREND_TOOL.name) {
              const latestPrompt = getLatestUserMessage(currentMessages);
              const inferredMetric = inferTrendMetricLabel(latestPrompt);
              // For curated trends Claude passes `metric`; for free-form
              // trends it passes `variable_id` + label + unit + table_id.
              // Either path is fine — runTrendTool forwards both shapes.
              const metricLabel = block.input?.metric || block.input?.label || inferredMetric;
              result = await runTrendTool({
                ...block.input,
                metric: block.input?.variable_id ? undefined : metricLabel,
              });
              if (result && Array.isArray(result.points)) {
                // Prefer the canonical resolved label echoed by /api/trend;
                // fall back to whatever Claude passed (location, or
                // city+state for back-compat with old prompts/conversations).
                const fallbackLabel =
                  String(block.input?.location || "").trim() ||
                  [String(block.input?.city || "").trim(), String(block.input?.state || "").trim()]
                    .filter(Boolean).join(", ") ||
                  "Series";
                const resolvedLabel = result.locationLabel || fallbackLabel;
                // Keep the variable label Claude passed so we can relabel the
                // series when the same place is called multiple times with
                // different variables (e.g. education-level comparison).
                const resolvedVarLabel = block.input?.label || block.input?.metric || metricLabel || null;
                const points = result.points.map((p) => ({
                  year: Number(p.year),
                  numericValue: Number(p.numericValue),
                }));
                trendSeries.push({ label: resolvedLabel, varLabel: resolvedVarLabel, points });
                if (result.variableLabel) lastTrendVariableLabel = result.variableLabel;
                if (result.seriesWarning) trendSeriesWarnings.push(result.seriesWarning);
                // Trend tool's result is an object (points + locationLabel),
                // so we can't piggyback `_sourceEntry` on it the way the
                // stat tools do. Push directly into the loop-level `sources`
                // array — the post-loop enrichment pass will run
                // attachNuancesAndMethodology on this entry like any other.
                // Pass the variable identity echoed by /api/trend so free-form
                // trends carry the right variable id and label rather than
                // re-resolving via parseQuery (which would fail for variables
                // outside VARIABLE_MAP).
                const trendEntry = buildTrendSourceEntry({
                  location: resolvedLabel,
                  metric: metricLabel,
                  points,
                  variableId: result.variableId,
                  variableLabel: result.variableLabel,
                  unit: result.unit,
                  tableId: result.tableId,
                  geoParams: result.geoParams || null,
                });
                if (trendEntry) sources.push(trendEntry);
              }
            } else if (block.name === CENSUS_TOOL.name) {
              result = await runCensusTool(block.input);
            } else if (block.name === ACS_VARIABLE_TOOL.name) {
              result = await runAcsVariableTool(block.input);
              if (result && !result.error && Number.isFinite(result.raw_value)) {
                acsVariableStructured = {
                  value: result.raw_value,
                  variable: result.metric,
                  variableId: block.input?.variable_id,
                  place: result.location,
                  year: Number(CURRENT_ACS_YEAR),
                  unit: result.unit,
                  moe: result.moe,
                  dataset: result.dataset,
                  source: result.source,
                  tables: result._sourceEntry?.tables || [{
                    tableId: result.table_id,
                    url: buildCensusTableUrl(result.table_id, result.dataset, null),
                  }],
                  ...(result.fallback_reason ? { fallbackReason: result.fallback_reason } : {}),
                  ...(result.validation_warning ? { validation_warning: result.validation_warning } : {}),
                };
                // Attach RAG-pulled methodology + nuance banners so the StatCard
                // shows the "More information" carrot for free-form variables too.
                // Symmetry with the curated fast path; the curated path runs this
                // automatically via attachNuancesAndMethodology in performPickedLookup
                // and the standard parseQuery path.
                await attachNuancesAndMethodology(acsVariableStructured, block.input?.variable_id);
              }
            } else if (block.name === BREAKDOWN_TOOL.name) {
              result = await runBreakdownTool(block.input);
              // Capture the bar-chart payload as the loop's final output —
              // visualize mode emits it as the chart reply at end-of-loop.
              if (result && result.type === "bar_chart" && Array.isArray(result.bars)) {
                lastBarChart = result;
              }
            } else if (block.name === ACS_DOCS_TOOL.name) {
              result = await runAcsDocsTool(block.input);
            } else {
              result = { error: `Unsupported tool: ${block.name}` };
            }
            // Capture the source entry attached by the runner (if any) into
            // the loop-level trail, then strip it before forwarding to Claude
            // so it doesn't bloat the tool_result payload Claude has to read.
            if (result && result._sourceEntry) {
              sources.push(result._sourceEntry);
              const { _sourceEntry, ...claudeFacing } = result;
              result = claudeFacing;
            }
            // Same pattern for the breakdown tool's _sourceEntries (plural —
            // one per bar). Push them all into the trail, strip from Claude-
            // facing payload.
            if (result && Array.isArray(result._sourceEntries)) {
              for (const e of result._sourceEntries) sources.push(e);
              const { _sourceEntries, ...claudeFacing } = result;
              result = claudeFacing;
            }
            // Safely serialize — catch any unexpected stringify failure
            let content;
            try {
              content = JSON.stringify(result);
            } catch {
              content = JSON.stringify({ error: "Failed to serialize tool result." });
            }
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content,
            };
          })
        );

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
        continue;
      }

      // Unexpected stop reason — bail out gracefully
      console.warn("[chat] Unexpected stop_reason:", response.stop_reason);
      break;
    }

    if (!finalReply && trendSeries.length === 0 && !lastBarChart) {
      // Loop exhausted without a text reply — likely repeated tool failures.
      // Make one final call with no tools so Claude must write a text response.
      console.warn("[chat] Loop exhausted without text reply — retrying with no tools.");
      try {
        const latestUserMsg = getLatestUserMessage(currentMessages);
        const fallbackResponse = await createMessageWithRetry({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: buildSystemPrompt(latestUserMsg, mode) +
            "\n\nNote: live data tools are temporarily unavailable. Answer the user’s question helpfully in plain text — if it was a specific data request, acknowledge you couldn’t retrieve it and suggest they try rephrasing. If it was a general or planning question, answer it directly from your knowledge.",
          messages,  // use original messages, not the tool-augmented ones
        });
        const textBlock = fallbackResponse.content.find(b => b.type === "text");
        finalReply = stripEmDashes(textBlock?.text) || "I wasn't able to retrieve that data right now. Please try again.";
      } catch (fallbackErr) {
        console.error("[chat] Fallback call failed:", fallbackErr);
        finalReply = "I wasn't able to retrieve that data right now. Please try again.";
      }
    }

    // Enrich each stat source in the trail with table-catalog grounding,
    // MOE methodology, and the deterministic nuance banners — same enrichment
    // the deterministic fast path applies to its single structured payload.
    // Run in parallel since each source's lookups are independent.
    if (sources.length > 0) {
      await Promise.all(sources.map((s) => {
        if (s.kind !== "stat" || !s.variableId) return Promise.resolve();
        return attachNuancesAndMethodology(s, s.variableId);
      }));
    }
    const sourcesField = sources.length > 0 ? { sources } : {};

    // In auto mode, emit a chart whenever Claude actually called chart tools.
    const hasChartData = trendSeries.length > 0 || !!lastBarChart;
    const emitChart = visualizationRequest || (mode === "auto" && hasChartData);

    if (emitChart) {
      // Bar chart takes precedence when present (Claude explicitly chose
      // categorical breakdown via get_census_breakdown). Trend chart is the
      // default — emit it when get_census_trend produced any series.
      if (lastBarChart) {
        return res.status(200).json({
          reply: JSON.stringify(lastBarChart),
          description: finalReply || null,
          ...sourcesField,
        });
      }
      if (trendSeries.length > 0) {
        // When all series share the same location (multi-variable, single place),
        // relabel each series with its variable label so the chart legend is
        // informative ("Bachelor's Degree" not "Boston, Massachusetts x3").
        let overrideLocation = null;
        const uniqueLocations = new Set(trendSeries.map(s => s.label));
        if (uniqueLocations.size === 1 && trendSeries.length > 1) {
          overrideLocation = [...uniqueLocations][0];
          for (const s of trendSeries) {
            s.label = s.varLabel || s.label;
          }
        }

        // Prefer the variable label echoed by /api/trend (works for both
        // curated and free-form trends). Fall back to inferTrendMetricLabel
        // for older flows where variableLabel wasn't surfaced.
        const metricLabel = (overrideLocation ? null : lastTrendVariableLabel) || inferTrendMetricLabel(initialUserMsg);
        const payload = buildTrendChartPayload(trendSeries, metricLabel, trendSeriesWarnings, {
          overrideLocation,
          singlePlace: !!overrideLocation,
        });
        return res.status(200).json({
          reply: JSON.stringify(payload),
          description: finalReply || null,
          ...sourcesField,
        });
      }
      // No chart produced — surface Claude's plain-text reply (e.g. a
      // clarification question, an explanation of why the request can't be
      // charted, or a location confirmation prompt).
      if (finalReply) {
        return res.status(200).json({ reply: finalReply, ...sourcesField });
      }
      // Should not reach here — Claude always produces text. Surface a
      // plain-language fallback rather than a generic error card.
      return res.status(200).json({ reply: "I wasn't able to generate a chart for that request. Could you rephrase or check the location?", ...sourcesField });
    }

    // For statistic mode, parse structured sections from the reply
    if (mode === "statistic" && finalReply) {
      const methMatch = finalReply.match(/\[methodology\]\s*([\s\S]*?)(?=\[caveats\]|$)/);
      const cavMatch = finalReply.match(/\[caveats\]\s*([\s\S]*)$/);

      if (methMatch || cavMatch) {
        // Strip markers from the main reply
        const answer = finalReply.replace(/\[methodology\][\s\S]*$/, "").trim();
        const methodology = methMatch ? methMatch[1].trim() : null;
        const caveats = cavMatch ? cavMatch[1].trim() : null;
        return res.status(200).json({
          reply: answer,
          methodology,
          caveats,
          ...(acsVariableStructured ? { structured: acsVariableStructured } : {}),
          ...(acsVariableAlternatives ? { alternatives: [acsVariableAlternatives] } : {}),
          ...sourcesField,
        });
      }
    }

    return res.status(200).json({
      reply: finalReply,
      ...(acsVariableStructured ? { structured: acsVariableStructured } : {}),
      ...(acsVariableAlternatives ? { alternatives: [acsVariableAlternatives] } : {}),
      ...sourcesField,
    });
  } catch (err) {
    console.error("[chat] API error:", err);
    const overloaded =
      err?.status === 529 ||
      err?.error?.error?.type === "overloaded_error" ||
      /overloaded/i.test(err?.message || "");
    if (overloaded) {
      return res.status(503).json({
        error: "The AI service is overloaded right now — please try again in a moment.",
      });
    }
    const message = err?.message || "Internal server error.";
    const status = message.includes("took too long") || message.includes("timed out") ? 504 : 500;
    return res.status(status).json({ error: message });
  }
}
