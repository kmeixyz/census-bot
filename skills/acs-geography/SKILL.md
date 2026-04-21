# ACS Geography Skill

## Purpose
Translate location references in research questions into valid Census geography parameters. Return the correct FIPS codes, `for` and `in` API parameters, and flag any geography limitations.

## Instructions

### Step 1 — Identify the geography level requested
Census data is available at these levels (from largest to smallest):
- **Nation** → `for=us:1`
- **Region** → `for=region:*` (Northeast=1, Midwest=2, South=3, West=4)
- **Division** → `for=division:*`
- **State** → `for=state:{FIPS}`
- **Metro Area (CBSA)** → `for=metropolitan statistical area/micropolitan statistical area:{code}`
- **County** → `for=county:{FIPS}&in=state:{FIPS}`
- **Place (city/town)** → `for=place:*&in=state:{FIPS}` then filter by name
- **ZCTA (ZIP code)** → `for=zip code tabulation area:{ZIP}`
- **Census Tract** → `for=tract:*&in=state:{FIPS} county:{FIPS}`

### Step 2 — Check estimate type availability
**1-year estimates** are only available for geographies with **population ≥ 65,000**.
This means:
- States: ✅ always available
- Large metros/cities: ✅ available
- Small cities/towns: ❌ use 5-year only
- Counties: ✅ if pop ≥ 65,000, otherwise 5-year only
- Census tracts / ZCTAs: ❌ 5-year only

### Step 3 — Output format
```json
{
  "location_label": "California",
  "geo_level": "state",
  "api_params": {
    "for": "state:06",
    "in": null
  },
  "fips": "06",
  "one_year_available": true,
  "notes": "California FIPS is 06. Population well above 65,000 threshold."
}
```

---

## State FIPS Codes (Complete)

| State | FIPS | Abbr | Region |
|-------|------|------|--------|
| Alabama | 01 | AL | South |
| Alaska | 02 | AK | West |
| Arizona | 04 | AZ | West |
| Arkansas | 05 | AR | South |
| California | 06 | CA | West |
| Colorado | 08 | CO | West |
| Connecticut | 09 | CT | Northeast |
| Delaware | 10 | DE | South |
| District of Columbia | 11 | DC | South |
| Florida | 12 | FL | South |
| Georgia | 13 | GA | South |
| Hawaii | 15 | HI | West |
| Idaho | 16 | ID | West |
| Illinois | 17 | IL | Midwest |
| Indiana | 18 | IN | Midwest |
| Iowa | 19 | IA | Midwest |
| Kansas | 20 | KS | Midwest |
| Kentucky | 21 | KY | South |
| Louisiana | 22 | LA | South |
| Maine | 23 | ME | Northeast |
| Maryland | 24 | MD | South |
| Massachusetts | 25 | MA | Northeast |
| Michigan | 26 | MI | Midwest |
| Minnesota | 27 | MN | Midwest |
| Mississippi | 28 | MS | South |
| Missouri | 29 | MO | Midwest |
| Montana | 30 | MT | West |
| Nebraska | 31 | NE | Midwest |
| Nevada | 32 | NV | West |
| New Hampshire | 33 | NH | Northeast |
| New Jersey | 34 | NJ | Northeast |
| New Mexico | 35 | NM | West |
| New York | 36 | NY | Northeast |
| North Carolina | 37 | NC | South |
| North Dakota | 38 | ND | Midwest |
| Ohio | 39 | OH | Midwest |
| Oklahoma | 40 | OK | South |
| Oregon | 41 | OR | West |
| Pennsylvania | 42 | PA | Northeast |
| Rhode Island | 44 | RI | Northeast |
| South Carolina | 45 | SC | South |
| South Dakota | 46 | SD | Midwest |
| Tennessee | 47 | TN | South |
| Texas | 48 | TX | South |
| Utah | 49 | UT | West |
| Vermont | 50 | VT | Northeast |
| Virginia | 51 | VA | South |
| Washington | 53 | WA | West |
| West Virginia | 54 | WV | South |
| Wisconsin | 55 | WI | Midwest |
| Wyoming | 56 | WY | West |

---

## Top California Out-Migration Destinations (2016–2024)

These are the states that receive the most California out-migrants, ranked by flow volume. Always include these in California migration analysis:

| Rank | State | FIPS | Notes |
|------|-------|------|-------|
| 1 | Texas | 48 | Largest single destination; Austin, Dallas metros |
| 2 | Arizona | 04 | Phoenix metro dominates; strong 2020+ surge |
| 3 | Nevada | 32 | Las Vegas, Reno; proximity and no state income tax |
| 4 | Washington | 53 | Seattle metro; tech worker migration |
| 5 | Oregon | 41 | Portland area; leveling off post-2021 |
| 6 | Florida | 12 | Growing since 2020; Miami, Tampa |
| 7 | Colorado | 08 | Denver metro; mountain west appeal |
| 8 | Idaho | 16 | Boise; fastest relative growth rate |
| 9 | Utah | 49 | Salt Lake City; tech/outdoor lifestyle |
| 10 | Montana | 30 | Smaller volume but large relative impact |

---

## Common Geography Mistakes to Avoid

1. **FIPS code 37 is NOT available** — skip 03, 07, 14, 43, 52 (territories/unused)
2. **New York City ≠ New York State** — NYC is `place:51000` within `state:36`
3. **Kansas City exists in both Kansas AND Missouri** — always specify state
4. **"Metro area" vs "city"** — Los Angeles the city (FIPS place:44000) is much smaller than the LA metro (CBSA:31080)
5. **Place FIPS codes** — cities don't use the same FIPS as counties; always use `for=place:*&in=state:{FIPS}` and filter by name

## Census API Base URLs by Year

```
ACS 1-Year: https://api.census.gov/data/{YEAR}/acs/acs1
ACS 5-Year: https://api.census.gov/data/{YEAR}/acs/acs5

Available 1-year years: 2005–2019, 2021–2023 (2020 not released due to COVID)
Available 5-year years: 2009–2023 (covering 5-year windows ending in that year)
```
