# ACS Temporal Caveats Skill

## Purpose
Surface time-series pitfalls, geographic boundary changes, and comparability
breaks whenever users ask about trends, historical comparisons, or changes
over time in ACS data. Apply these rules before presenting any multi-year
finding.

---

## 1. Geographic Boundary Changes

### City / Place Boundaries
Cities annex and de-annex territory. The same FIPS place code can refer to
a physically different area in different years.

**High-risk cities** (frequent annexation):
Austin TX, Nashville TN, San Antonio TX, Jacksonville FL, Columbus OH,
Charlotte NC, Houston TX, Phoenix AZ, Oklahoma City OK, Indianapolis IN.

**Rule:** When comparing city-level data across 5+ years for any of these
places, warn the user that boundary changes may inflate or deflate apparent
growth. Suggest checking the Census Bureau's Boundary and Annexation Survey
(BAS) for the specific city.

**Example caveat:**
"Austin's population grew 25% from 2010 to 2022, but part of that growth
reflects annexed territory — not just people moving in. The 2010 and 2022
figures cover different physical areas."

### Census Tract Changes
Tracts are redrawn every decennial Census. The 2010 and 2020 tract maps are
different — thousands of tracts were split, merged, or renumbered.

**Rule:** Never compare tract-level data across decennials without using a
crosswalk. The NHGIS or Census Bureau publishes tract relationship files
(2010-to-2020 crosswalks).

**Rule:** Within a single decennial period (e.g. 2012–2019 or 2021–2025),
tract boundaries are stable and can be compared directly.

### ZCTA ≠ ZIP Code
ZCTAs (ZIP Code Tabulation Areas) are Census-drawn approximations of USPS
ZIP codes. They differ from actual ZIP codes in important ways:

- ZCTAs are redrawn each decennial (2010 ZCTAs ≠ 2020 ZCTAs)
- Some ZIP codes have no ZCTA (PO boxes, single-delivery ZIPs)
- ZCTA boundaries can cross county and state lines
- A ZCTA may cover a different physical area than its ZIP code

**Rule:** When users ask about "ZIP code" data, clarify that ACS uses ZCTAs,
not actual ZIP codes, and that boundaries changed between 2010 and 2020.

### County Boundaries
County boundaries almost never change. Rare exceptions:
- Virginia independent cities (treated as county-equivalents)
- Bedford City VA merged into Bedford County in 2013 (FIPS 51515 → 51019)
- Shannon County SD renamed to Oglala Lakota County in 2015 (FIPS 46113 → 46102)

**Rule:** County-level comparisons across years are generally safe. Flag only
the Virginia/South Dakota exceptions if those specific counties come up.

---

## 2. Metro Area (CBSA) Redefinitions

The Office of Management and Budget (OMB) redefines Core Based Statistical
Areas periodically. Major updates:

| Update | Effect |
|--------|--------|
| 2013 (based on 2010 Census) | Counties added/removed from many metros; some metros renamed |
| 2023 (based on 2020 Census) | Significant changes — 144 CBSAs modified, 3 new metros, 11 removed |

**Common traps:**
- The "Austin-Round Rock" metro added Caldwell County in 2013
- The "Dallas-Fort Worth-Arlington" metro boundaries shifted in 2013 and 2023
- "Las Vegas-Henderson-Paradise" was renamed from "Las Vegas-Paradise"
- Some metros were split (e.g. Miami was separated from Fort Lauderdale)

**Rule:** When comparing metro-area data across 10+ years, note which OMB
delineation vintage applies. ACS data files tag the vintage but most users
don't realize the geographic scope changed.

**Example caveat:**
"The Austin metro area added Caldwell County in the 2013 OMB update. Data
from 2012 and 2014 for 'Austin metro' refer to different sets of counties."

---

## 3. Data Availability and Gaps

### ACS Product Availability by Year

| Year Range | ACS 1-Year | ACS 5-Year | Notes |
|------------|-----------|-----------|-------|
| Pre-2005 | ❌ | ❌ | ACS didn't exist — use decennial Census |
| 2005–2008 | Limited | ❌ | 1-year only, limited geography |
| 2009 | ✅ | ✅ (2005–2009) | First 5-year release |
| 2010–2019 | ✅ | ✅ | Normal annual releases |
| 2020 | ⚠️ Experimental | ✅ (2016–2020) | 1-year had low response; most analysts skip it |
| 2021+ | ✅ | ✅ | Normal releases resumed |

**Rule:** Always skip or flag 2020 1-year data. The experimental estimates
had response rates as low as 50% in some areas. The 2016–2020 5-year is
usable but slightly degraded.

### Population Threshold for 1-Year Estimates
ACS 1-year estimates are only published for geographies with population
≥65,000. Smaller places only appear in 5-year estimates.

**Trap:** A city that crosses 65,000 population will suddenly "appear" in
1-year data. This doesn't mean it's new — it just crossed the threshold.

### 5-Year Overlap Problem
5-year estimates from consecutive years share 4 out of 5 years of data.
2017–2021 and 2018–2022 share the 2018, 2019, 2020, and 2021 survey years.

**Rule:** Never treat overlapping 5-year periods as independent data points.
For real year-over-year change, use 1-year estimates (if available) or
compare non-overlapping 5-year periods (e.g. 2013–2017 vs 2018–2022).

---

## 4. Concept and Question Changes

### Race and Ethnicity (2020 Change)
The 2020 Census and subsequent ACS changed how race data is collected:
- "Some Other Race" responses were reclassified more aggressively
- The multiracial ("Two or More Races") population appeared to jump ~276%
  from 2010 to 2020 — mostly a measurement change, not a real demographic shift
- Hispanic/Latino origin question remained separate but coding changed

**Rule:** Do NOT present 2010-vs-2020 race data as showing real demographic
change without heavily caveating the measurement change. The apparent surge
in multiracial population is largely methodological.

### Disability Definition (2008 Change)
ACS changed its disability questions in 2008. Pre-2008 and post-2008
disability data are not comparable.

**Rule:** Never compare disability rates across the 2008 boundary.

### Commute / Work from Home (2020+ Change)
COVID permanently changed commuting patterns. Pre-2020 work-from-home rates
(~5%) vs post-2020 (~25%+) reflect a real behavioral shift but also
coincide with ACS methodology adjustments for the pandemic.

**Rule:** Flag the COVID discontinuity when comparing commute data across
2019–2021.

### Income and Dollar Values
ACS reports income in nominal (current-year) dollars. Comparing $50,000 in
2015 to $55,000 in 2022 without inflation adjustment is misleading.

**Rule:** Always adjust for inflation when comparing dollar values across
years. Use CPI-U or CPI-U-RS. State whether figures are nominal or real.

---

## 5. Place Types: Incorporated vs. CDP

Census "places" include two types that users often confuse:

| Type | Legal boundary? | Governed? | Stable over time? |
|------|----------------|-----------|-------------------|
| Incorporated place (city, town, village) | Yes | Yes (has a mayor/council) | Mostly, but annexation changes boundaries |
| CDP (Census Designated Place) | No | No | Redrawn each decennial by Census Bureau |

**Common CDPs users mistake for cities:**
Arlington VA (CDP, not a city), Paradise NV, Spring TX, The Woodlands TX,
Columbia MD, Bethesda MD, Silver Spring MD.

**Rule:** When a user asks about a CDP, note that it's not an incorporated
city, its boundaries are Census-defined and change each decennial, and
comparisons across decennials require extra caution.

---

## 6. When to Surface These Caveats

Apply these rules contextually. Not every query needs a caveat wall. Use this
priority system:

**Always caveat (will mislead if omitted):**
- Comparing city data for known high-annexation cities across 5+ years
- Comparing race data across the 2010/2020 boundary
- Using 2020 ACS 1-year data
- Comparing overlapping 5-year periods as if independent
- Dollar values across years without inflation adjustment

**Caveat if relevant (mention briefly):**
- Metro area comparisons across OMB redefinition years
- Tract-level comparisons across decennials
- ZCTA vs ZIP code distinction
- CDP boundary instability

**Skip the caveat (low risk):**
- Single-year, single-geography queries ("What's the rent in Chicago?")
- County-level comparisons (boundaries rarely change)
- State-level comparisons (boundaries never change)
- Queries within a single decennial period using the same ACS product
