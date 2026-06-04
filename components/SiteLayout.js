// components/SiteLayout.js
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import ThemeToggle from "./ThemeToggle";
import styles from "../styles/SiteLayout.module.css";

function NavIconMore() {
  // Subtle "More" affordance — three vertical dots.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  );
}

function NavIconChat({ size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
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

function NavIconSearch({ size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function SiteLayout({ children }) {
  const router = useRouter();
  const path = router.pathname;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreWrapRef = useRef(null);

  const chatActive = path === "/chat" || path.startsWith("/chat/");
  const exploreActive = path === "/explore" || path.startsWith("/explore/");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the popover whenever the route changes (a link was tapped).
  useEffect(() => {
    setMenuOpen(false);
  }, [router.asPath]);

  // Close the popover on Escape, or on a click/tap outside of it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = e => { if (e.key === "Escape") setMenuOpen(false); };
    const onPointer = e => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [menuOpen]);

  const linkClass = href => {
    const active =
      href === "/"
        ? path === "/"
        : path === href || path.startsWith(`${href}/`);
    return `${styles.navLink} ${active ? styles.navLinkActive : ""}`;
  };

  return (
    <div className={`${styles.shell} ${chatActive ? styles.chatRoute : ""}`}>
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <div className={styles.navLeft}>
          <Link href="/" className={styles.logoText}>
            CensusBot
          </Link>
        </div>
        <div className={styles.navTrailing}>
          {/* On mobile the header is just the logo + the "More" icon. The
              primary workflows move to the bottom nav; About + theme live in
              the popover. All inline items below hide under 720px. */}
          <Link href="/about" className={`${linkClass("/about")} ${styles.desktopNavItem}`}>
            About
          </Link>
          <Link href="/explore" className={`${linkClass("/explore")} ${styles.desktopNavItem}`}>
            Quick Lookup
          </Link>
          <Link
            href="/chat"
            className={`${styles.cta} ${chatActive ? styles.ctaActive : ""} ${styles.desktopNavItem}`}
          >
            <NavIconChat />
            Ask Question
          </Link>
          <span className={styles.desktopNavItem}>
            <ThemeToggle />
          </span>

          {/* "More" popover — mobile only */}
          <div className={styles.moreWrap} ref={moreWrapRef}>
            <button
              type="button"
              className={styles.moreButton}
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
            >
              <NavIconMore />
            </button>
            {menuOpen && (
              <div className={styles.morePopover} role="menu" aria-label="More options">
                <Link href="/about" className={`${linkClass("/about")} ${styles.moreItem}`} role="menuitem">
                  About
                </Link>
                <div className={styles.moreDivider} aria-hidden />
                <div className={styles.moreThemeRow}>
                  <span className={styles.moreThemeLabel}>Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className={styles.main}>{children}</main>

      {/* ── Mobile bottom navigation bar ── */}
      <nav className={styles.bottomNav} aria-label="Primary">
        <Link
          href="/explore"
          className={`${styles.bottomNavItem} ${exploreActive ? styles.bottomNavItemActive : ""}`}
        >
          <NavIconSearch size={22} />
          <span>Quick Lookup</span>
        </Link>
        <Link
          href="/chat"
          className={`${styles.bottomNavItem} ${chatActive ? styles.bottomNavItemActive : ""}`}
        >
          <NavIconChat size={22} />
          <span>Ask Question</span>
        </Link>
      </nav>
    </div>
  );
}
