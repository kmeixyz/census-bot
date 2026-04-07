# CensusBot — ACS Data Explorer

Ask natural-language questions about U.S. Census data, powered by the **ACS 5-Year Estimates** (2022).

```
Browser (UI)
   ↓
Vercel Frontend (Next.js)
   ↓
Vercel Serverless API Route  ← Census API key stays here, never in browser
   ↓
Census API (ACS 5-year)
   ↓
Formatted Response → User
```

---

## Example Queries

- `median income in Evanston, Illinois`
- `population in Texas`
- `median rent in Seattle, Washington`
- `median home value in Boston, Massachusetts`
- `poverty rate in Chicago, Illinois`
- `commute time in Austin, Texas`

---

## Folder Structure

```
census-bot/
├── lib/
│   ├── censusTranslator.js    ← NL query → ACS variable + geography
│   └── censusApi.js           ← Constructs + fires Census API request
├── pages/
│   ├── _app.js                ← Global styles wrapper
│   ├── index.js               ← Frontend UI (React)
│   └── api/
│       └── query.js           ← Serverless backend (keeps API key safe)
├── styles/
│   ├── globals.css            ← Base styles / CSS variables
│   └── Home.module.css        ← Page-scoped styles
├── public/                    ← Static assets (favicon, etc.)
├── .env.local.example         ← Template for your local env
├── .gitignore                 ← Prevents .env.local from being committed
├── next.config.js
└── package.json
```

---

## Local Development

### 1. Install dependencies

```bash
cd census-bot
npm install
```

### 2. Set up your environment variable

Copy the example file and add your Census API key:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and replace the placeholder:

```env
CENSUS_API_KEY=56dfa374822e6da77d1c564a5ad7eb7f6da22b08
```

> ⚠️ **Never commit `.env.local` to Git.** It's already in `.gitignore`.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

### Step 1 — Push to GitHub

Initialize a Git repo if you haven't already:

```bash
git init
git add .
git commit -m "initial commit"
```

Create a new **empty** repository on GitHub (don't initialize with README), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/census-bot.git
git branch -M main
git push -u origin main
```

### Step 2 — Import into Vercel

1. Go to [vercel.com](https://vercel.com) and log in (or sign up — free tier is fine).
2. Click **"Add New Project"**.
3. Click **"Import"** next to your `census-bot` GitHub repo.
4. Vercel will auto-detect it as a Next.js project. Leave the build settings as-is.

### Step 3 — Add the Environment Variable

Before clicking "Deploy":

1. Scroll down to **"Environment Variables"**.
2. Click **"Add"** and enter:
   - **Name**: `CENSUS_API_KEY`
   - **Value**: `56dfa374822e6da77d1c564a5ad7eb7f6da22b08`
3. Leave the environment selector as **Production, Preview, Development** (all three).

### Step 4 — Deploy

Click **"Deploy"**. Vercel will:
- Install dependencies (`npm install`)
- Build the app (`npm run build`)
- Deploy the frontend + serverless API routes

In ~60 seconds you'll get a live URL like `https://census-bot-xyz.vercel.app`.

### Step 5 — Verify It Works

Visit your live URL, type a query, and hit Run. If you see a result, you're live.

---

## How It Works

### Translation Layer (`lib/censusTranslator.js`)

Converts plain-English queries into structured Census API parameters:

| User says | Maps to |
|---|---|
| "income" / "median income" | `B19013_001E` (Median Household Income) |
| "population" / "how many people" | `B01003_001E` (Total Population) |
| "rent" / "median rent" | `B25064_001E` (Median Gross Rent) |
| "home value" | `B25077_001E` (Median Home Value) |
| "poverty" | `B17001_002E` (People Below Poverty Level) |
| "median age" | `B01002_001E` (Median Age) |
| "commute time" | `B08303_001E` (Travel Time to Work) |

Geography is parsed from context — "in Evanston, Illinois" → place FIPS lookup inside state FIPS 17.

### API Route (`pages/api/query.js`)

The serverless function is the security layer. It:
1. Receives the query from the frontend (POST body)
2. Calls `parseQuery()` to translate it
3. Reads `CENSUS_API_KEY` from the server environment
4. Calls the Census API
5. Returns a formatted JSON response

The Census API key **never touches the browser**.

---

## Adding More Variables

Open `lib/censusTranslator.js` and add to `VARIABLE_MAP`:

```js
"your keyword": { id: "B_VARIABLE_CODE", label: "Human Label", format: "currency" },
```

Formats: `"currency"` | `"number"` | `"years"` | `"minutes"`

Find variable codes at: https://api.census.gov/data/2022/acs/acs5/variables.html

---

## Adding More Cities

Open `lib/censusTranslator.js` and add to `CITY_STATE_HINTS`:

```js
"your city": "state name",
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `CENSUS_API_KEY is not set` | Add the env var in Vercel project settings and redeploy |
| City not found | Add it to `CITY_STATE_HINTS` in `censusTranslator.js` |
| "No data returned" | The ACS may not have data for that geography/variable combo |
| Build fails | Check Node version — Vercel defaults to Node 18, which is fine |
