// pages/index.js
import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import styles from "../styles/Home.module.css";

const EXAMPLES = [
  "median income in Evanston, Illinois",
  "population in Texas",
  "median rent in Seattle, Washington",
  "median home value in Boston, Massachusetts",
  "poverty rate in Chicago, Illinois",
  "median age in California",
  "unemployment in New York",
  "commute time in Austin, Texas",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setResult(data);
        setHistory(prev => [{ query: q, result: data }, ...prev].slice(0, 5));
      }
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function useExample(ex) {
    setQuery(ex);
    setResult(null);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <>
      <Head>
        <title>CensusBot — ACS Data Explorer</title>
        <meta
          name="description"
          content="Ask natural language questions about US Census ACS data."
        />
        <link rel="icon" href="/favicon.ico" />

        {/* Inter font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        className={styles.page}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Glow orb */}
        <div className={styles.orb} />

        <header className={styles.header}>
          <div className={styles.badge}>ACS 5-YEAR · 2022</div>
          <h1 className={styles.title}>
            Census<span className={styles.accent}>Bot</span>
          </h1>
          <p className={styles.subtitle}>
            Ask anything about US demographics in plain English.
          </p>
        </header>

        <main className={styles.main}>
          {/* Input */}
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputWrap}>
              <span className={styles.prompt}>›</span>
              <input
                ref={inputRef}
                className={styles.input}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="median income in Evanston, Illinois"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className={styles.button}
                type="submit"
                disabled={loading || !query.trim()}
              >
                {loading ? <span className={styles.spinner} /> : "RUN"}
              </button>
            </div>
          </form>

          {/* Result */}
          {result && (
            <div className={styles.result}>
              <div className={styles.resultLabel}>{result.metric}</div>
              <div className={styles.resultValue}>{result.value}</div>
              <div className={styles.resultLocation}>
                📍 {result.location}
              </div>
              <div className={styles.resultSource}>{result.source}</div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>⚠</span>
              {error}
            </div>
          )}

          {/* Example queries */}
          <div className={styles.examples}>
            <div className={styles.examplesLabel}>try an example</div>
            <div className={styles.exampleGrid}>
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  className={styles.exampleBtn}
                  onClick={() => useExample(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className={styles.history}>
              <div className={styles.historyLabel}>recent queries</div>
              {history.map((item, i) => (
                <div key={i} className={styles.historyItem}>
                  <button
                    className={styles.historyQuery}
                    onClick={() => useExample(item.query)}
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
          <br />
          This tool is for informational purposes only.
        </footer>
      </div>
    </>
  );
}