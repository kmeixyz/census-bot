// pages/index.js
import { useState, useEffect } from "react";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import TrendChart from "../components/TrendChart";

const QUERY_TYPES = [
  "median income",
  "population",
  "median rent",
  "median home value",
  "poverty rate",
  "median age",
  "unemployment rate",
  "commute time",
  "median household income",
  "per capita income",
];

const STATES_CITIES = {
  Alabama: ["Birmingham", "Huntsville", "Mobile", "Montgomery", "Tuscaloosa"],
  Alaska: ["Anchorage", "Fairbanks", "Juneau", "Sitka", "Wasilla"],
  Arizona: ["Chandler", "Gilbert", "Glendale", "Mesa", "Phoenix", "Scottsdale", "Tempe", "Tucson"],
  Arkansas: ["Fayetteville", "Fort Smith", "Jonesboro", "Little Rock", "Springdale"],
  California: ["Fresno", "Long Beach", "Los Angeles", "Oakland", "Sacramento", "San Diego", "San Francisco", "San Jose", "Santa Ana", "Anaheim"],
  Colorado: ["Aurora", "Boulder", "Colorado Springs", "Denver", "Fort Collins", "Lakewood"],
  Connecticut: ["Bridgeport", "Hartford", "New Haven", "Stamford", "Waterbury"],
  Delaware: ["Dover", "Newark", "Wilmington"],
  Florida: ["Cape Coral", "Fort Lauderdale", "Jacksonville", "Miami", "Orlando", "St. Petersburg", "Tampa"],
  Georgia: ["Athens", "Atlanta", "Augusta", "Columbus", "Savannah"],
  Hawaii: ["Hilo", "Honolulu", "Kailua", "Kapolei", "Pearl City"],
  Idaho: ["Boise", "Caldwell", "Idaho Falls", "Meridian", "Nampa"],
  Illinois: ["Aurora", "Chicago", "Evanston", "Joliet", "Naperville", "Peoria", "Rockford", "Springfield"],
  Indiana: ["Evansville", "Fort Wayne", "Indianapolis", "South Bend"],
  Iowa: ["Cedar Rapids", "Davenport", "Des Moines", "Iowa City", "Sioux City"],
  Kansas: ["Kansas City", "Olathe", "Overland Park", "Topeka", "Wichita"],
  Kentucky: ["Bowling Green", "Covington", "Lexington", "Louisville", "Owensboro"],
  Louisiana: ["Baton Rouge", "Lafayette", "New Orleans", "Shreveport"],
  Maine: ["Auburn", "Augusta", "Bangor", "Portland"],
  Maryland: ["Annapolis", "Baltimore", "Frederick", "Gaithersburg", "Rockville"],
  Massachusetts: ["Boston", "Cambridge", "Lowell", "Springfield", "Worcester"],
  Michigan: ["Ann Arbor", "Detroit", "Flint", "Grand Rapids", "Lansing", "Sterling Heights", "Warren"],
  Minnesota: ["Bloomington", "Duluth", "Minneapolis", "Rochester", "Saint Paul"],
  Mississippi: ["Biloxi", "Gulfport", "Hattiesburg", "Jackson", "Southaven"],
  Missouri: ["Columbia", "Independence", "Kansas City", "Springfield", "St. Louis"],
  Montana: ["Billings", "Great Falls", "Helena", "Missoula"],
  Nebraska: ["Bellevue", "Lincoln", "Omaha"],
  Nevada: ["Henderson", "Las Vegas", "North Las Vegas", "Reno", "Sparks"],
  "New Hampshire": ["Concord", "Dover", "Manchester", "Nashua"],
  "New Jersey": ["Elizabeth", "Jersey City", "Newark", "Paterson", "Trenton"],
  "New Mexico": ["Albuquerque", "Las Cruces", "Rio Rancho", "Roswell", "Santa Fe"],
  "New York": ["Albany", "Buffalo", "New York City", "Rochester", "Syracuse", "Yonkers"],
  "North Carolina": ["Charlotte", "Durham", "Fayetteville", "Greensboro", "Raleigh", "Winston-Salem"],
  "North Dakota": ["Bismarck", "Fargo", "Grand Forks", "Minot"],
  Ohio: ["Akron", "Cincinnati", "Cleveland", "Columbus", "Dayton", "Toledo"],
  Oklahoma: ["Broken Arrow", "Norman", "Oklahoma City", "Tulsa"],
  Oregon: ["Eugene", "Gresham", "Hillsboro", "Portland", "Salem"],
  Pennsylvania: ["Allentown", "Erie", "Philadelphia", "Pittsburgh", "Reading"],
  "Rhode Island": ["Cranston", "Pawtucket", "Providence", "Warwick", "Woonsocket"],
  "South Carolina": ["Charleston", "Columbia", "Greenville", "Mount Pleasant", "North Charleston"],
  "South Dakota": ["Aberdeen", "Rapid City", "Sioux Falls"],
  Tennessee: ["Chattanooga", "Clarksville", "Knoxville", "Memphis", "Nashville"],
  Texas: ["Arlington", "Austin", "Corpus Christi", "Dallas", "El Paso", "Fort Worth", "Houston", "Laredo", "Lubbock", "San Antonio"],
  Utah: ["Ogden", "Orem", "Provo", "Salt Lake City", "West Valley City"],
  Vermont: ["Burlington", "Essex Junction", "Montpelier", "Rutland"],
  Virginia: ["Alexandria", "Arlington", "Chesapeake", "Norfolk", "Richmond", "Virginia Beach"],
  Washington: ["Bellevue", "Seattle", "Spokane", "Tacoma", "Vancouver"],
  "West Virginia": ["Charleston", "Huntington", "Morgantown", "Parkersburg"],
  Wisconsin: ["Green Bay", "Kenosha", "Madison", "Milwaukee", "Racine"],
  Wyoming: ["Casper", "Cheyenne", "Gillette", "Laramie"],
};

const STATE_NAMES = Object.keys(STATES_CITIES).sort();

export default function Home() {
  const [queryType, setQueryType] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [locationLevel, setLocationLevel] = useState("city");

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const cities = selectedState ? STATES_CITIES[selectedState] : [];

  useEffect(() => {
    setSelectedCity("");
    setLocationLevel("city");
  }, [selectedState]);

  function buildQuery() {
    if (!queryType || !selectedState) return "";
    if (locationLevel === "state" || !selectedCity) {
      return `${queryType} in ${selectedState}`;
    }
    return `${queryType} in ${selectedCity}, ${selectedState}`;
  }

  const query = buildQuery();
  const canRun = !!(queryType && selectedState && (locationLevel === "state" || selectedCity));

  async function handleSubmit() {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setTrend(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setResult(data);
        setHistory(prev => [{ query, result: data }, ...prev].slice(0, 5));
      }
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTrend() {
    if (!canRun) return;
    setTrendLoading(true);
    setTrend(null);
    try {
      const res = await fetch("/api/trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Trend fetch failed.");
      else setTrend(data);
    } catch {
      setError("Network error fetching trend.");
    } finally {
      setTrendLoading(false);
    }
  }

  function replayHistory(item) {
    setResult(item.result);
    setError(null);
    setTrend(null);
  }

  return (
    <>
      <Head>
        <title>CensusBot — ACS Data Explorer</title>
        <meta name="description" content="Explore US Census ACS data with filters." />
        <link rel="icon" href="/favicon.ico" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={styles.page} style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className={styles.orb} />

        <header className={styles.header}>
          <div className={styles.badge}>ACS 5-YEAR · 2022</div>
          <h1 className={styles.title}>
            Census<span className={styles.accent}>Bot</span>
          </h1>
          <p className={styles.subtitle}>
            Explore US demographics with filters.
          </p>
        </header>

        <main className={styles.main}>
          {/* Filter row */}
          <div className={styles.filterRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>METRIC</label>
              <div className={styles.selectWrap}>
                <select
                  className={styles.select}
                  value={queryType}
                  onChange={e => { setQueryType(e.target.value); setResult(null); setError(null); setTrend(null); }}
                >
                  <option value="">Select metric…</option>
                  {QUERY_TYPES.map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>
            </div>

            <span className={styles.filterIn}>in</span>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>STATE</label>
              <div className={styles.selectWrap}>
                <select
                  className={styles.select}
                  value={selectedState}
                  onChange={e => { setSelectedState(e.target.value); setResult(null); setError(null); setTrend(null); }}
                >
                  <option value="">Select state…</option>
                  {STATE_NAMES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedState && (
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>CITY <span className={styles.optional}>(optional)</span></label>
                <div className={styles.selectWrap}>
                  <select
                    className={styles.select}
                    value={selectedCity}
                    onChange={e => {
                      setSelectedCity(e.target.value);
                      setLocationLevel(e.target.value ? "city" : "state");
                      setResult(null);
                      setError(null);
                      setTrend(null);
                    }}
                  >
                    <option value="">Entire state</option>
                    {cities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              className={styles.button}
              onClick={handleSubmit}
              disabled={loading || !canRun}
              style={{ alignSelf: "flex-end" }}
            >
              {loading ? <span className={styles.spinner} /> : "RUN"}
            </button>
          </div>

          {/* Query preview */}
          {query && (
            <div className={styles.queryPreview}>
              <span className={styles.prompt}>›</span> {query}
            </div>
          )}

          {/* Result — with green glow */}
          {result && (
            <div
              className={styles.result}
              style={{
                boxShadow: "0 0 24px rgba(34, 197, 94, 0.12), 0 0 48px rgba(34, 197, 94, 0.06)",
              }}
            >
              <div className={styles.resultLabel}>{result.metric}</div>
              <div
                className={styles.resultValue}
                style={{ textShadow: "0 0 20px rgba(255,255,255,0.15)" }}
              >
                {result.value}
              </div>
              <div className={styles.resultLocation}>📍 {result.location}</div>
              <div className={styles.resultSource}>{result.source}</div>
            </div>
          )}

          {/* Trend button — only appears after a successful result */}
          {result && (
            <button
              className={styles.button}
              onClick={handleTrend}
              disabled={trendLoading}
              style={{ marginTop: 12, background: "#1e1e30", fontSize: 13 }}
            >
              {trendLoading ? <span className={styles.spinner} /> : "📈 SHOW 5-YEAR TREND"}
            </button>
          )}

          {/* Trend chart */}
          {trend && <TrendChart data={trend} />}

          {/* Error */}
          {error && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>⚠</span>
              {error}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className={styles.history}>
              <div className={styles.historyLabel}>recent queries</div>
              {history.map((item, i) => (
                <div key={i} className={styles.historyItem}>
                  <button
                    className={styles.historyQuery}
                    onClick={() => replayHistory(item)}
                  >
                    {item.query}
                  </button>
                  <span className={styles.historyValue}>
                    {item.result.value} · {item.result.location}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>

        <footer className={styles.footer}>
          Data source: U.S. Census Bureau, American Community Survey 5-Year Estimates.
        </footer>
      </div>
    </>
  );
}