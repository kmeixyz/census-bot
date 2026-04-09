// Add to imports at top
import TrendChart from "../components/TrendChart";

// Add inside Home() alongside your other useState hooks
const [trend, setTrend] = useState(null);
const [trendLoading, setTrendLoading] = useState(false);

// Add this new handler function
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

// In your JSX, after the result block, add:
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

{trend && <TrendChart data={trend} />}