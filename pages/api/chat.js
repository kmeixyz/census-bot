// pages/api/chat.js
// Server-side Claude chatbot endpoint with Census API tool use.
// ANTHROPIC_API_KEY is read from .env.local — never exposed to the browser.

import Anthropic from "@anthropic-ai/sdk";
import { parseQuery, formatValue } from "../../lib/censusTranslator";
import { fetchCensusValue } from "../../lib/censusApi";
import { QUERY_TYPES } from "../../lib/censusConstants";
import fs from "fs";
import path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Skill loader ──────────────────────────────────────────────────────────────
const SKILLS_DIR = path.join(process.cwd(), "skills");

// Always-on general skill
function loadGeneralSkill() {
  try {
    return fs.readFileSync(path.join(SKILLS_DIR, "acs-general", "ACS_SKILL.md"), "utf8");
  } catch {
    return "";
  }
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
    file: path.join(SKILLS_DIR, "acs-housing-migration", "SKILL.md"),
    keywords: ["migrat", "mov", "california", "left", "relocat", "out-migrant", "housing cost", "afford", "rent burden", "where people"],
  },
  {
    file: path.join(SKILLS_DIR, "acs-api-builder", "SKILL.md"),
    keywords: ["api", "url", "endpoint", "fetch", "request", "query string", "build", "construct", "http"],
  },
];

function loadConditionalSkills(userMessage) {
  const lower = userMessage.toLowerCase();
  const loaded = [];
  for (const skill of CONDITIONAL_SKILLS) {
    if (skill.keywords.some(kw => lower.includes(kw))) {
      try {
        loaded.push(fs.readFileSync(skill.file, "utf8"));
      } catch {
        // skill file missing — skip
      }
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

const BASE_SYSTEM_PROMPT = `You are a friendly, knowledgeable U.S. Census data assistant built into CensusBot.
You help users understand American Community Survey (ACS) data — things like income, rent, population, poverty rates, employment, age, and commute times for cities across the United States.

You have access to a live Census data lookup tool. Use it proactively when a user asks about specific metrics for a city/state — don't just describe what you could look up, actually call the tool and return the real number.

Available metrics you can look up: ${QUERY_TYPES.join(", ")}.

Guidelines:
- Be concise and direct. Lead with the data, then add brief context if helpful.
- When you retrieve live data, present the value clearly and mention it comes from ACS 5-Year Estimates.
- If a metric or location isn't supported, suggest the closest available option.
- You can look up multiple metrics in one response if the user asks for several things.
- Don't make up numbers — always use the tool for specific statistics.
- For general questions about what ACS data means, answer from your knowledge.`;

function buildSystemPrompt(userMessage) {
  const general = loadGeneralSkill();
  const conditional = loadConditionalSkills(userMessage);
  const parts = [BASE_SYSTEM_PROMPT];
  if (general) parts.push("---\n" + general);
  if (conditional.length > 0) parts.push("---\n" + conditional.join("\n\n---\n"));
  return parts.join("\n\n");
}

async function runCensusTool(toolInput) {
  const { metric, city, state } = toolInput;
  const query = `${metric} in ${city}, ${state}`;

  const censusApiKey = process.env.CENSUS_API_KEY;
  if (!censusApiKey) {
    return { error: "Census API key not configured on server." };
  }

  try {
    const parsed = parseQuery(query);
    if (parsed.error) return { error: parsed.error };

    const { variable, geoParams, locationLabel } = parsed;
    const rawValue = await fetchCensusValue(variable.id, geoParams, censusApiKey);
    const formattedValue = formatValue(rawValue, variable.format);

    return {
      metric: variable.label,
      value: formattedValue,
      location: locationLabel,
      source: "ACS 5-Year Estimates (2022), U.S. Census Bureau",
    };
  } catch (err) {
    return { error: err.message || "Failed to fetch Census data." };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server configuration error: missing Anthropic API key." });
  }

  try {
    // Agentic loop: keep running until Claude stops requesting tool calls
    let currentMessages = messages;
    let finalReply = null;

    for (let i = 0; i < 5; i++) {
      // Build system prompt with general skill always + conditional skills for this message
      const latestUserMsg = currentMessages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
      const systemPrompt = buildSystemPrompt(latestUserMsg);

      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        tools: [CENSUS_TOOL],
        messages: currentMessages,
      });

      // No tool calls — we have the final reply
      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find(b => b.type === "text");
        finalReply = textBlock ? textBlock.text : "(no response)";
        break;
      }

      // Tool use requested
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const result = await runCensusTool(block.input);
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          })
        );

        // Append assistant's tool-call turn + tool results, then loop
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
        continue;
      }

      // Unexpected stop reason
      break;
    }

    if (!finalReply) {
      return res.status(500).json({ error: "Claude did not produce a final response." });
    }

    return res.status(200).json({ reply: finalReply });
  } catch (err) {
    console.error("Chat API error:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}
