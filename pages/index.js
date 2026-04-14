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
              <div className={`${landing.iconCircle} ${landing.iconPurple}`}>◇</div>
              <h2 className={landing.featureTitle}>ACS Metrics</h2>
              <p className={landing.featureBody}>
                Explore key metrics like income, rent, population, poverty, age, and employment.
              </p>
            </div>
          </article>
          <article className={`${landing.featureCard} ${landing.featureCardBlue}`}>
            <div className={landing.featureCardInner}>
              <div className={`${landing.iconCircle} ${landing.iconBlue}`}>◎</div>
              <h2 className={landing.featureTitle}>Places & Trends</h2>
              <p className={landing.featureBody}>
                Focus on a city and state, and view interactive charts showing changes over the past five years.
              </p>
            </div>
          </article>
          <article className={`${landing.featureCard} ${landing.featureCardTeal}`}>
            <div className={landing.featureCardInner}>
              <div className={`${landing.iconCircle} ${landing.iconTeal}`}>
                <span className={landing.openDataGlyph}>✦</span>
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
