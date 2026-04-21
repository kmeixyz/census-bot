# ACS Table Selector Skill

## Purpose
Given a research question, identify the most relevant American Community Survey (ACS) tables, the specific variable codes to pull, and why each table is needed.

## Instructions

When a user asks a Census research question, respond with a structured JSON object and a plain-English explanation. Follow this process:

### Step 1 — Classify the research question
Identify what domain(s) the question touches:
- **Housing**: rent, home value, cost burden, tenure, vacancy
- **Income**: household income, per capita income, earnings by industry
- **Migration**: who moved, where from/to, recent movers
- **Demographics**: age, race, sex, household composition
- **Employment**: labor force, unemployment, industry, occupation
- **Education**: attainment, enrollment, field of study
- **Poverty**: poverty status, public assistance, SNAP
- **Commuting**: travel time, transportation mode, work-from-home

### Step 2 — Select 3–5 tables using the catalog below
Always prefer the most specific table over a general one. Prioritize tables that:
1. Directly measure the key outcome variable
2. Capture the comparison group (e.g., movers vs. non-movers)
3. Provide the denominator or context (e.g., total population, total households)

### Step 3 — Output format
Return a JSON block followed by a plain-English summary:

```json
{
  "tables": [
    {
      "table_id": "B25070",
      "name": "Gross Rent as a Percentage of Household Income",
      "why_needed": "Primary measure of housing cost burden — normalizes rent against income for fair cross-geography comparison",
      "key_variables": [
        { "code": "B25070_001E", "label": "Total renter-occupied units" },
        { "code": "B25070_010E", "label": "Paying 50%+ of income on rent" }
      ],
      "universe": "Renter-occupied housing units",
      "available_years": "2005–present (1-year); 2009–present (5-year)"
    }
  ],
  "recommended_estimate_type": "1-year",
  "reason_for_estimate_type": "Trend analysis 2016–2025 requires annual data points",
  "notes": "For migration questions, always pair B25xxx housing tables with B07xxx mobility tables"
}
```

---

## ACS Table Catalog

### Housing
| Table | Name | Key Variable | Notes |
|-------|------|-------------|-------|
| B25070 | Gross Rent as % of Income | B25070_010E (50%+ burden) | Best single housing affordability metric |
| B25064 | Median Gross Rent | B25064_001E | Raw rent in dollars |
| B25077 | Median Home Value | B25077_001E | Owner-occupied only |
| B25003 | Tenure | B25003_002E (owner), B25003_003E (renter) | Owner vs. renter split |
| B25001 | Housing Units | B25001_001E | Total housing stock |
| B25031 | Median Gross Rent by Bedrooms | B25031_001E–007E | Controls for unit size |
| B25002 | Occupancy Status | B25002_003E | Vacancy rate |
| B25075 | Value of Owner-Occupied Units | B25075_001E–027E | Home value distribution |
| B25106 | Housing Costs as % of Income (owners) | B25106_001E | Ownership cost burden |

### Migration / Mobility
| Table | Name | Key Variable | Notes |
|-------|------|-------------|-------|
| B07001 | Geographical Mobility by Age | B07001_065E (from different state) | Who moved, and from where |
| B07004 | Mobility by Race | B07004A–I series | Demographic breakdown of movers |
| B07010 | Mobility by Employment Status | B07010_001E | Labor market status of movers |
| B07011 | Median Income by Mobility | B07011_007E (different state movers) | Income profile of recent migrants |
| B07013 | Mobility by Tenure | B07013_001E | Renter vs. owner movers |
| B07402 | Movers Between States (origin) | State-to-state flow | Use for California out-migration specifically |

### Income
| Table | Name | Key Variable | Notes |
|-------|------|-------------|-------|
| B19013 | Median Household Income | B19013_001E | Most cited income measure |
| B19301 | Per Capita Income | B19301_001E | Better for cost-of-living comparisons |
| B19001 | Household Income Distribution | B19001_001E–017E | Full income brackets |
| B20004 | Median Earnings by Sex/Education | B20004_001E | Controls for education |

### Employment
| Table | Name | Key Variable | Notes |
|-------|------|-------------|-------|
| B23025 | Employment Status | B23025_004E (employed), B23025_005E (unemployed) | Standard employment measure |
| B24011 | Occupation by Median Earnings | B24011_001E | Industry/occupation wage data |
| B08303 | Travel Time to Work | B08303_001E | Commute burden |
| B08301 | Means of Transportation | B08301_010E (work from home) | Remote work indicator |

### Demographics
| Table | Name | Key Variable | Notes |
|-------|------|-------------|-------|
| B01003 | Total Population | B01003_001E | Always include as context |
| B01002 | Median Age | B01002_001E | Age profile |
| B02001 | Race | B02001_002E (White alone), etc. | Racial composition |
| B11001 | Household Type | B11001_001E | Family vs. non-family |

### Education & Poverty
| Table | Name | Key Variable | Notes |
|-------|------|-------------|-------|
| B15003 | Educational Attainment | B15003_022E (bachelor's), B15003_023E (master's) | Ed level |
| B17001 | Poverty Status | B17001_002E (below poverty) | Poverty count |
| B17010 | Poverty by Family Type | B17010_001E | Family poverty |

---

## Special Rules

**For migration + housing questions (e.g., "Did people save money by leaving California?"):**
Always combine:
1. A mobility table (B07001 or B07011) to identify and profile the mover population
2. A housing cost table (B25070 or B25064) for both origin AND destination states
3. An income table (B19013) to contextualize costs

**For trend analysis (2016–2025):**
- Use **ACS 1-year estimates** (not 5-year) for annual data points
- 1-year estimates are only available for geographies with population ≥ 65,000
- 5-year estimates are more reliable for small geographies but can't be used for year-over-year trends

**For comparing two states:**
Run the same variable query for both states and calculate the difference or ratio. Do not compare 1-year and 5-year estimates in the same analysis.

**Variable suffix meanings:**
- `E` = Estimate (the number itself)
- `M` = Margin of error
- `PE` = Percent estimate
- `PM` = Percent margin of error
