# ACS Housing + Migration Research Skill

## Purpose
Deep-dive playbook for researching housing costs in the context of geographic migration — especially California out-migration. Covers the full analytical pipeline from question to cleaned dataset to visualization.

## The Core Problem with "Before/After" Migration Studies in ACS

ACS is a **cross-sectional** survey, not a panel study. It does not follow the same person over time. This means you cannot directly observe "Person X paid $3,000/month rent in CA, then moved to TX and paid $1,500/month."

What you CAN do instead — three valid approaches:

### Approach A: Geographic Comparison (most common)
Compare housing costs in California to housing costs in destination states. Assumes movers experience the average conditions of their destination.
- **Pro**: Simple, replicable, good for trend charts
- **Con**: Doesn't control for neighborhood selection within destination state

### Approach B: Mover Income Profiling (more nuanced)
Use B07011 (income by mobility) to get the economic profile of people who recently moved from another state, then compare their income to local housing costs. This reveals cost burden *for the specific mover population*, not just the average resident.
- **Pro**: Closer to the actual migrant experience
- **Con**: Requires two-step calculation (income from B07011 + housing costs from B25070)

### Approach C: CPS ASEC (outside ACS — better for longitudinal)
The Current Population Survey Annual Social and Economic Supplement *does* track households year-over-year. If you need true before/after individual tracking, mention CPS ASEC as an alternative data source.

---

## Standard Analysis Pipeline

### 1. Establish California Baseline
Pull annually (2016–2025) for California (`state:06`):
- `B25070_010E` — % of renters paying 50%+ of income on rent
- `B25064_001E` — Median gross rent
- `B25077_001E` — Median home value
- `B19013_001E` — Median household income

### 2. Identify Top Destination States
Use B07402 (state-to-state flows) or external IRS migration data to rank destinations.
Default to: TX (48), AZ (04), NV (32), WA (53), OR (41), FL (12), CO (08), ID (16)

### 3. Pull Same Variables for Destination States
Same variables, same years, all destination states. This enables side-by-side comparison.

### 4. Compute Housing Cost Savings Estimate
For each destination state:
```
rent_savings = CA_median_rent - DEST_median_rent
burden_change = CA_rent_burden_pct - DEST_rent_burden_pct
```

### 5. Control for Income Differences
Movers often have different incomes than the average resident of either state. If possible, use B07011 to get mover-specific incomes:
```
mover_adjusted_burden = DEST_median_rent / B07011_007E (mover median income) * 12
```

### 6. Account for Ownership vs. Rental
Use B25003 (tenure) to understand what share of the population owns vs. rents in each state. Movers are more likely to rent initially, so weight rent metrics higher for migration analysis.

---

## Key Variables Reference (Housing + Migration)

```
HOUSING COST BURDEN
B25070_001E  Total renter-occupied housing units
B25070_007E  30.0–34.9% of income on rent
B25070_008E  35.0–39.9% of income on rent
B25070_009E  40.0–49.9% of income on rent
B25070_010E  50.0%+ of income on rent (severely cost-burdened)

RENT LEVELS
B25064_001E  Median gross rent
B25031_001E  Median gross rent (all units)
B25031_002E  No bedroom (studio)
B25031_003E  1 bedroom
B25031_004E  2 bedrooms
B25031_005E  3 bedrooms

HOME VALUES
B25077_001E  Median value (owner-occupied)
B25075_020E  $500,000–$749,999 (useful for tracking CA price tier)
B25075_024E  $1,000,000+ (luxury/CA-specific tier)

TENURE
B25003_001E  Total occupied housing units
B25003_002E  Owner-occupied
B25003_003E  Renter-occupied

MIGRATION FLOWS
B07001_001E  Total population 1 year and older
B07001_017E  Same house (did not move)
B07001_033E  Moved within same county
B07001_049E  Moved from different county, same state
B07001_065E  Moved from different state
B07001_081E  Moved from abroad

MOVER INCOME PROFILE
B07011_001E  Median income — all movers
B07011_002E  Median income — same house (non-movers)
B07011_004E  Median income — same county movers
B07011_005E  Median income — different county, same state
B07011_007E  Median income — different state movers ← KEY VARIABLE
B07011_008E  Median income — movers from abroad
```

---

## Chart Types to Use for Each Finding

| Finding | Recommended Chart |
|---------|------------------|
| CA rent vs. destination states over time | Multi-line chart (year on x-axis) |
| Cost burden % by state | Horizontal bar chart, sorted |
| Migration volume to each state | Bubble map or ranked bar |
| Home value distribution | Histogram or violin plot |
| Income vs. rent ratio by state | Scatter plot with state labels |
| Year-over-year change | Area chart with shading |

---

## Common Interpretive Pitfalls

1. **Correlation ≠ causation**: Rising home prices in Boise after 2020 may be partly caused BY California in-migration, not just revealed by it. Mention this in any analysis.

2. **Survivor bias in mover data**: People who moved to a destination state and then moved *again* may not be captured. High-income movers who bought homes are well-represented; low-income movers who moved back are not.

3. **2020 ACS data gap**: ACS 1-year estimates were not published for 2020 due to COVID-19 data collection disruption. Use 2019 → 2021 with a note about the gap.

4. **5-year estimates overlap**: The 2017–2021 5-year estimate and the 2018–2022 5-year estimate share 4 years of data. Do not treat them as independent observations.

5. **Median vs. mean**: ACS typically reports medians. Medians understate the housing cost for the highest-burden households. For equity analysis, emphasize the 50%+ burden bracket (B25070_010E).

6. **Inflation adjustment**: Comparing 2016 median rent to 2025 median rent requires CPI adjustment. Note this as a required data cleaning step.
