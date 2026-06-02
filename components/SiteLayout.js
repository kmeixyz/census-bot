// components/SiteLayout.js
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import ThemeToggle from "./ThemeToggle";
import styles from "../styles/SiteLayout.module.css";

function NavIconChat() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function SiteLayout({ children }) {
  const router = useRouter();
  const path = router.pathname;
  const [scrolled, setScrolled] = useState(false);

  const chatActive = path === "/chat" || path.startsWith("/chat/");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkClass = href => {
    const active =
      href === "/"
        ? path === "/"
        : path === href || path.startsWith(`${href}/`);
    return `${styles.navLink} ${active ? styles.navLinkActive : ""}`;
  };

  return (
    <div className={styles.shell}>
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <div className={styles.navLeft}>
          <Link href="/" className={styles.logoText}>
            CensusBot
          </Link>
        </div>
        <div className={styles.navTrailing}>
          <Link href="/about" className={linkClass("/about")}>
            About
          </Link>
          <Link href="/explore" className={linkClass("/explore")}>
            Quick Lookup
          </Link>
          <Link
            href="/chat"
            className={`${styles.cta} ${chatActive ? styles.ctaActive : ""}`}
          >
            <NavIconChat />
            Ask Question
          </Link>
          <ThemeToggle />
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
