// pages/index.js — Home
import { useState, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import SiteLayout from "../components/SiteLayout";
import landing from "../styles/Landing.module.css";

const S = { width:16, height:16, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:2, strokeLinecap:"round", strokeLinejoin:"round", "aria-hidden":true };

function IcoDollar()   { return <svg {...S}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function IcoKey()      { return <svg {...S}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>; }
function IcoPeople()   { return <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IcoScale()    { return <svg {...S}><path d="M12 3v18"/><path d="M7 21h10"/><path d="M3 5L21 10"/><path d="m2 13 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m16 18 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/></svg>; }
function IcoCalendar() { return <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IcoBrief()    { return <svg {...S}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>; }
function IcoGrad()     { return <svg {...S}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>; }
function IcoHouse()    { return <svg {...S}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }

function IcoSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

const QUICK_LOOKUP_CHIPS = [
  { slug: "income",     label: "Median Income", Icon: IcoDollar },
  { slug: "rent",       label: "Rent",          Icon: IcoKey },
  { slug: "population", label: "Population",    Icon: IcoPeople },
  { slug: "poverty",    label: "Poverty",       Icon: IcoScale },
  { slug: "age",        label: "Age",           Icon: IcoCalendar },
  { slug: "employment", label: "Employment",    Icon: IcoBrief },
  { slug: "education",  label: "Education",     Icon: IcoGrad },
  { slug: "housing",    label: "Housing",       Icon: IcoHouse },
];

const SUGGESTIONS = [
  "What's the median income in Austin, TX?",
  "Show me population growth in Seattle",
  "Compare rent prices between NYC and San Francisco",
  "What's the poverty rate in Chicago?",
  "Education levels in Boston, MA",
];

function HomeSearchBar() {
  const [query, setQuery]     = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const router   = useRouter();

  function go(text) {
    const q = (text ?? query).trim();
    if (!q) return;
    router.push(`/chat?prefill=${encodeURIComponent(q)}`);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") go();
  }

  function handleSuggestionMouseDown(e, suggestion) {
    e.preventDefault();
    go(suggestion);
  }

  const showSuggestions = focused && query.trim() === "";

  return (
    <div className={landing.homeSearchWrap}>
      <div className={`${landing.searchRow} ${focused ? landing.searchRowFocused : ""}`}>
        <span className={landing.searchIcon}><IcoSearch /></span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., What's the median rent in Austin?"
          className={landing.searchInput}
          aria-label="Ask a question about Census data"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => go()}
          className={landing.searchSubmitBtn}
          aria-label="Submit question"
        >
          Search
        </button>
      </div>

      {showSuggestions && (
        <div className={landing.searchDropdown} role="listbox" aria-label="Suggested questions">
          <div className={landing.searchDropdownLabel}>Try asking…</div>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              role="option"
              className={landing.searchDropdownItem}
              onMouseDown={e => handleSuggestionMouseDown(e, s)}
            >
              <span className={landing.searchDropdownBullet}>↗</span>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Head>
        <title>CensusBot — Home</title>
        <meta name="description" content="Explore US Census ACS data with a guided flow." />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <SiteLayout>
        <div className={landing.pageWrapper}>
          <div className={landing.pageContent}>
            <section className={landing.hero}>
              <p className={landing.heroHeading}>
                Ask questions about U.S. community data
                <span className={landing.heroAccent}>in natural language</span>
              </p>
              <p className={landing.heroSub}>
                Explore demographics, housing, income, and more across American communities
              </p>
            </section>

            <div className={landing.homeActions}>
              <HomeSearchBar />

              <section className={landing.quickstart}>
                <div className={landing.quickstartHeader}>
                  <div className={landing.eyebrow}>Quick Lookup</div>
                  <Link href="/explore" className={landing.allMetricsLink}>All 37 metrics →</Link>
                </div>
                <h2 className={landing.quickstartTitle}>Popular Metrics</h2>
                <div className={landing.metricGrid}>
                  {QUICK_LOOKUP_CHIPS.map(chip => (
                    <Link
                      key={chip.slug}
                      href={`/explore?m=${chip.slug}`}
                      className={landing.metricCard}
                    >
                      <div className={landing.metricCardIcon}><chip.Icon /></div>
                      <span className={landing.metricCardLabel}>{chip.label}</span>
                    </Link>
                  ))}
                </div>
              </section>

              <div className={landing.aboutCard}>
                <h3 className={landing.aboutCardTitle}>About the Data</h3>
                <p className={landing.aboutSectionLabel}>Data Source</p>
                <p className={landing.aboutSectionText}>
                  All data comes from the U.S. Census Bureau American Community Survey (1-Year and 5-Year Estimates, 2024)
                </p>
                <p className={landing.aboutSectionLabel}>Understanding Estimates</p>
                <p className={landing.aboutSectionText}>
                  5-year estimates provide the most reliable data for small geographic areas and rare populations
                </p>
                <Link href="/learn" className={landing.learnMoreLink}>Learn more →</Link>
              </div>
            </div>

            <footer className={landing.footerNote}>
              Data Source: U.S. Census Bureau, American Community Survey (1-Year and 5-Year Estimates, 2024)
            </footer>
          </div>
        </div>
      </SiteLayout>
    </>
  );
}
