// pages/explore/location.js — Step 2: choose state + city
import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import SiteLayout from "../../components/SiteLayout";
import ex from "../../styles/Explore.module.css";
import homeStyles from "../../styles/Home.module.css";
import {
  EXPLORE_METRICS_STORAGE_KEY,
  STATES_CITIES,
  STATE_NAMES,
} from "../../lib/censusConstants";

export default function ExploreLocation() {
  const router = useRouter();
  const targetProgress = 67;
  const fromProgress = useMemo(() => {
    const raw = router.query.from;
    const val = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(val) ? val : 33;
  }, [router.query.from]);
  const [ready, setReady] = useState(false);
  const [stateName, setStateName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [progressWidth, setProgressWidth] = useState(fromProgress);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(EXPLORE_METRICS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        router.replace("/explore");
        return;
      }

      const qState = Array.isArray(router.query.state) ? router.query.state[0] : router.query.state;
      const qCity = Array.isArray(router.query.city) ? router.query.city[0] : router.query.city;
      if (qState && STATES_CITIES[qState]) {
        setStateName(qState);
        if (qCity && STATES_CITIES[qState]?.includes(qCity)) setCity(qCity);
      }
    } catch {
      router.replace("/explore");
      return;
    }
    setReady(true);
  }, [router]);

  const cities = stateName ? STATES_CITIES[stateName] : [];

  useEffect(() => {
    setProgressWidth(fromProgress);
    const id = requestAnimationFrame(() => setProgressWidth(targetProgress));
    return () => cancelAnimationFrame(id);
  }, [fromProgress]);

  const canContinue = !!(stateName && city);

  function viewResults() {
    if (!canContinue) {
      setFormError("Choose a state and a city. City is required.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    router.push({
      pathname: "/explore/results",
      query: { state: stateName, city, from: targetProgress },
    });
  }

  if (!ready) {
    return (
      <>
        <Head>
          <title>CensusBot — Explore</title>
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <SiteLayout>
          <p className={ex.hint} style={{ marginTop: "3rem" }}>Loading…</p>
        </SiteLayout>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>CensusBot — Explore (location)</title>
        <meta name="description" content="Choose state and city for ACS lookup." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <SiteLayout>
        <div className={ex.wizardPage}>
          <h1 className={ex.pageTitle}>Explore Data</h1>

          <div className={ex.progressBlock}>
            <div className={ex.progressRow}>
              <span>Step 2 of 3</span>
              <span className={ex.progressPct}>67% Complete</span>
            </div>
            <div className={ex.progressTrack}>
              <div className={ex.progressFill} style={{ width: `${progressWidth}%` }} />
            </div>
          </div>

          <div className={ex.card}>
            <p className={ex.question}>Where do you want to look?</p>

            <div className={ex.fieldGroup}>
              <label className={ex.fieldLabel} htmlFor="explore-state">State</label>
              <select
                id="explore-state"
                className={ex.select}
                value={stateName}
                onChange={e => {
                  setStateName(e.target.value);
                  setCity("");
                  setFormError(null);
                }}
              >
                <option value="">Select state…</option>
                {STATE_NAMES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className={ex.fieldGroup}>
              <label className={ex.fieldLabel} htmlFor="explore-city">City</label>
              <select
                id="explore-city"
                className={ex.select}
                value={city}
                disabled={!stateName}
                onChange={e => {
                  setCity(e.target.value);
                  setFormError(null);
                }}
              >
                <option value="">{stateName ? "Select city…" : "Choose a state first"}</option>
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {formError && (
              <div className={homeStyles.error} style={{ marginTop: "1rem" }}>
                <span className={homeStyles.errorIcon}>⚠</span>
                {formError}
              </div>
            )}

            <div className={ex.footerNav} style={{ marginTop: "1.25rem", maxWidth: "none" }}>
              <Link href={{ pathname: "/explore", query: { from: targetProgress, restore: 1 } }} className={ex.btnBack}>
                ← Back
              </Link>
              <button
                type="button"
                className={ex.btnPrimary}
                disabled={submitting || !canContinue}
                onClick={viewResults}
              >
                {submitting ? <span className={ex.spinner} /> : "View Results"}
              </button>
            </div>
          </div>
        </div>
      </SiteLayout>
    </>
  );
}
