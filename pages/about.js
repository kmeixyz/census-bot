// pages/about.js
import { useState, useEffect } from "react";
import Head from "next/head";
import SiteLayout from "../components/SiteLayout";
import landing from "../styles/Landing.module.css";

const NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "how-its-built", label: "Tech Stack" },
  { id: "the-team", label: "Our Team" },
];

const GLANCE = [
  {
    label: "Data source",
    value: "American Community Survey (ACS)",
    href: "https://www.census.gov/programs-surveys/acs.html",
  },
  {
    label: "Built at",
    value: "Knight Lab",
    href: "https://studio.knightlab.com/projects/censusbot/",
  },
  {
    label: "Contact",
    value: "JoeGermuska@northwestern.edu",
    href: "mailto:JoeGermuska@northwestern.edu",
  },
];

const OVERVIEW_PARAS = [
  "Ask about any U.S. community and CensusBot pulls the relevant American " +
    "Community Survey numbers. You get the figures, the context, the margins of " +
    "error, and a chart when one helps. You skip the raw Census tables entirely.",
];

const TECH_TEXT =
  "CensusBot connects a web frontend, the Census Bureau's data, and a language " +
  "model so you can explore community data without learning the Census table " +
  "system. Requests run on the server, so API keys never reach the browser.";

const STEPS = [
  {
    num: "01",
    title: "Guided Search",
    desc: "Pick a metric and a location to start.",
  },
  {
    num: "02",
    title: "Ask a Question",
    desc: "Type your question in plain English and get an answer with sources.",
  },
  {
    num: "03",
    title: "Explore Trends",
    desc: "See how the data shifts over time, with charts and short summaries.",
  },
];

const BUILT_ROWS = [
  {
    label: "Frontend",
    tags: ["Next.js", "React", "Recharts", "Framer Motion", "Lucide Icons"],
  },
  {
    label: "Design",
    tags: ["Responsive layout", "Accessibility", "Light and dark themes"],
  },
  {
    label: "Data & AI",
    tags: [
      "ACS API",
      "Server-side query handling",
      "Claude",
      "Indexed ACS documentation retrieval",
    ],
  },
];

const TEAM = [
  { name: "Joe Germuska", role: "Faculty Advisor" },
  { name: "Feixu Chen", role: "Project Team" },
  { name: "Sasha Draeger-Mazer", role: "Project Team" },
  { name: "Kevin Mei", role: "Project Team" },
  { name: "Grace Shao", role: "Project Team" },
  { name: "Navya Singh", role: "Project Team" },
];

function initials(name) {
  return name
    .split(/\s+/)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function About() {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const sections = NAV_SECTIONS
      .map(section => document.getElementById(section.id))
      .filter(Boolean);

    const onScroll = () => {
      // Detection line at 30% from the top of the viewport: the active
      // section is the last one whose top has scrolled above that line.
      const line = window.innerHeight * 0.3;
      let current = sections[0]?.id;
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      // When the page is scrolled to the bottom, the final (short) section
      // may never reach the line, so force it active here.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) current = sections[sections.length - 1]?.id;
      if (current) setActiveSection(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <Head>
        <title>CensusBot — About</title>
        <meta name="description" content="About the CensusBot ACS explorer project." />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <SiteLayout>
        <div className={landing.aboutLayout}>
          <aside className={landing.aboutSidebar}>
            <div className={landing.aboutSidebarInner}>
              <h1 className={landing.aboutSidebarTitle}>About CensusBot</h1>

              <nav className={landing.aboutNav} aria-label="About sections">
                {NAV_SECTIONS.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={`${landing.aboutNavLink} ${
                      activeSection === section.id ? landing.aboutNavLinkActive : ""
                    }`}
                  >
                    {section.label}
                  </a>
                ))}
              </nav>

              <div className={landing.glanceBlock}>
                <dl className={landing.glanceList}>
                  {GLANCE.map(item => (
                    <div key={item.label} className={landing.glanceItem}>
                      <dt className={landing.glanceItemLabel}>{item.label}</dt>
                      <dd className={landing.glanceItemValue}>
                        {item.href ? (
                          <a
                            href={item.href}
                            className={landing.glanceLink}
                            {...(item.href.startsWith("http")
                              ? { target: "_blank", rel: "noopener noreferrer" }
                              : {})}
                          >
                            {item.value}
                          </a>
                        ) : (
                          item.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </aside>

          <div className={landing.aboutContent}>
            <section id="overview" className={landing.aboutSection}>
              <h2 className={landing.aboutSectionTitle}>Overview</h2>
              <p className={landing.aboutLead}>
                Explore ACS data in plain English.
              </p>
              {OVERVIEW_PARAS.map((para, i) => (
                <p
                  key={i}
                  className={`${landing.aboutText} ${i > 0 ? landing.aboutTextSpaced : ""}`}
                >
                  {para}
                </p>
              ))}
              <ol className={landing.stepList}>
                {STEPS.map(step => (
                  <li key={step.num} className={landing.stepItem}>
                    <span className={landing.stepNum}>{step.num}</span>
                    <span className={landing.stepBody}>
                      <span className={landing.stepTitle}>{step.title}</span>
                      <span className={landing.stepDesc}>{step.desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <hr className={landing.aboutDivider} />

            <section id="how-its-built" className={landing.aboutSection}>
              <h2 className={landing.aboutSectionTitle}>Tech Stack</h2>
              <p className={landing.aboutText}>{TECH_TEXT}</p>
              <div className={landing.builtRows}>
                {BUILT_ROWS.map(row => (
                  <div key={row.label} className={landing.builtRow}>
                    <span className={landing.builtRowLabel}>{row.label}</span>
                    <div className={landing.tagGroup}>
                      {row.tags.map(tag => (
                        <span key={tag} className={landing.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <hr className={landing.aboutDivider} />

            <section id="the-team" className={landing.aboutSection}>
              <h2 className={landing.aboutSectionTitle}>Our Team</h2>
              <div className={landing.teamGrid}>
                {TEAM.map(member => (
                  <div key={member.name} className={landing.teamCard}>
                    <span className={landing.teamAvatar} aria-hidden>
                      {initials(member.name)}
                    </span>
                    <span className={landing.teamInfo}>
                      <span className={landing.teamName}>{member.name}</span>
                      <span className={landing.teamRole}>{member.role}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </SiteLayout>
    </>
  );
}
