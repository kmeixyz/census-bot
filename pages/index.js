// pages/index.js — Home
import Head from "next/head";
import Link from "next/link";
import SiteLayout from "../components/SiteLayout";
import LightningIcon from "../components/LightningIcon";
import landing from "../styles/Landing.module.css";

export default function Home() {
  return (
    <>
      <Head>
        <title>CensusBot — Home</title>
        <meta name="description" content="Explore US Census ACS data with a guided flow." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <SiteLayout>
        <section className={landing.hero}>
          <h1 className={landing.title}>
            <span className={landing.titleGradient}>CensusBot</span>
          </h1>
          <p className={landing.leadStrong}>Ask questions about U.S. community data in plain English.</p>
          <p className={landing.lead}>
            Explore information from the American Community Survey (ACS). Choose a place, view key statistics,
            and track changes over time.
          </p>
        </section>

        <div className={landing.cardGrid}>
          <article className={`${landing.featureCard} ${landing.featureCardPurple}`}>
            <div className={landing.featureCardInner}>
              <div className={`${landing.iconCircle} ${landing.iconPurple}`}>
                <svg
                  className={landing.featureIcon}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M4 20V5" />
                  <path d="M4 20H20" />
                  <rect x="7" y="11" width="3" height="7" rx="1" />
                  <rect x="12" y="8" width="3" height="10" rx="1" />
                  <rect x="17" y="6" width="3" height="12" rx="1" />
                </svg>
              </div>
              <h2 className={landing.featureTitle}>ACS Metrics</h2>
              <p className={landing.featureBody}>
                Explore key metrics like income, rent, population, poverty, age, and employment.
              </p>
            </div>
          </article>
          <article className={`${landing.featureCard} ${landing.featureCardBlue}`}>
            <div className={landing.featureCardInner}>
              <div className={`${landing.iconCircle} ${landing.iconBlue}`}>
                <svg
                  className={landing.featureIcon}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 21C7 16.2 5 13.8 5 10.5A7 7 0 0 1 19 10.5C19 13.8 17 16.2 12 21Z" />
                  <circle cx="12" cy="10.5" r="2.25" />
                </svg>
              </div>
              <h2 className={landing.featureTitle}>Places & Trends</h2>
              <p className={landing.featureBody}>
                Focus on a city and state, and view interactive charts showing changes over the past five years.
              </p>
            </div>
          </article>
          <article className={`${landing.featureCard} ${landing.featureCardTeal}`}>
            <div className={landing.featureCardInner}>
              <div className={`${landing.iconCircle} ${landing.iconTeal}`}>
                <svg
                  className={landing.featureIcon}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M9 11C9 6.9 11.8 4 15 4C17.8 4 20 6.2 20 9" />
                </svg>
              </div>
              <h2 className={landing.featureTitle}>Open Data</h2>
              <p className={landing.featureBody}>
                All results use publicly available ACS 5-year estimates, with clear source information included.
              </p>
            </div>
          </article>
        </div>

        <div className={landing.ctaRow}>
          <Link href="/explore" className={landing.ctaLarge}>
            <span className={landing.ctaLargeIcon}>
              <LightningIcon size={34} />
            </span>
            <span className={landing.ctaLargeLabel}>Explore Data</span>
            <span className={landing.ctaLargeArrow} aria-hidden>
              →
            </span>
          </Link>
          <p className={landing.ctaSub}>See where the data takes you</p>
        </div>

        <footer className={landing.footerNote}>
          Data Source: U.S. Census Bureau, American Community Survey (5-Year Estimates)
        </footer>
      </SiteLayout>
    </>
  );
}
