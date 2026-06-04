// components/SiteLayout.js
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import ThemeToggle from "./ThemeToggle";
import styles from "../styles/SiteLayout.module.css";

function NavIconMenu() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);

  const chatActive = path === "/chat" || path.startsWith("/chat/");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes (a link was tapped).
  useEffect(() => {
    setMenuOpen(false);
  }, [router.asPath]);

  // Close the mobile menu on Escape for keyboard users.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = e => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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
          {/* Secondary items (About, theme) live in the hamburger on mobile to
              keep the header pristine; they show inline from tablet up. */}
          <Link href="/about" className={`${linkClass("/about")} ${styles.desktopNavItem}`}>
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
          <span className={styles.desktopNavItem}>
            <ThemeToggle />
          </span>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <NavIconMenu />
          </button>
        </div>
      </nav>

      {/* ── Mobile slide-out menu ── */}
      {menuOpen && (
        <div className={styles.menuOverlay}>
          <div
            className={styles.menuBackdrop}
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <aside className={styles.menuPanel} role="dialog" aria-modal="true" aria-label="Menu">
            <div className={styles.menuPanelHeader}>
              <span className={styles.menuPanelTitle}>Menu</span>
              <button
                type="button"
                className={styles.menuClose}
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <Link href="/about" className={`${linkClass("/about")} ${styles.menuLink}`}>
              About
            </Link>
            <div className={styles.menuThemeRow}>
              <span className={styles.menuThemeLabel}>Theme</span>
              <ThemeToggle />
            </div>
          </aside>
        </div>
      )}

      <main className={styles.main}>{children}</main>
    </div>
  );
}
