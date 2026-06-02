// components/ThemeProvider.js
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// useLayoutEffect runs synchronously before paint on the client (prevents a
// theme flash on first render) but the SSR renderer can't run effects at all,
// so it emits a hydration-mismatch warning. Swap to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const STORAGE_KEY = "census-bot-theme";

const ThemeContext = createContext({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

function readStoredTheme() {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function resolveTheme() {
  return readStoredTheme() ?? "light";
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// A9: run the DOM theme swap inside a View Transition so the new theme reveals
// as a growing circle from `origin` ({ x, y } in viewport px — usually the
// toggle button). Falls back to an instant swap where unsupported or when the
// user prefers reduced motion.
function withThemeTransition(origin, mutate) {
  if (typeof document === "undefined") return mutate();
  const root = document.documentElement;
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    mutate();
    return;
  }
  if (origin) {
    root.style.setProperty("--vt-x", `${origin.x}px`);
    root.style.setProperty("--vt-y", `${origin.y}px`);
  }
  root.classList.add("theme-reveal");
  const transition = document.startViewTransition(() => mutate());
  transition.finished.finally(() => root.classList.remove("theme-reveal"));
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("light");
  // Mirror of `theme` so toggleTheme can read the current value without
  // re-creating the callback or running side effects inside a state updater.
  const themeRef = useRef("light");

  useIsomorphicLayoutEffect(() => {
    const attr = document.documentElement.dataset.theme;
    if (attr === "light" || attr === "dark") {
      themeRef.current = attr;
      setThemeState(attr);
      return;
    }
    const next = resolveTheme();
    themeRef.current = next;
    setThemeState(next);
    applyTheme(next);
  }, []);

  const setTheme = useCallback((next, origin) => {
    themeRef.current = next;
    withThemeTransition(origin, () => {
      setThemeState(next);
      applyTheme(next);
    });
  }, []);

  const toggleTheme = useCallback(origin => {
    const next = themeRef.current === "dark" ? "light" : "dark";
    themeRef.current = next;
    withThemeTransition(origin, () => {
      setThemeState(next);
      applyTheme(next);
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
