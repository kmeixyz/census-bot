// pages/_app.js
import "../styles/globals.css";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useRouter } from "next/router";
import { ThemeProvider } from "../components/ThemeProvider";
import ScrollbarReveal from "../components/ScrollbarReveal";

// A10: subtle fade + 8px upward slide on route change. Kept gentle (opacity-led)
// so it never fights the explore wizard's own per-step slide transitions.
const routeVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: 0, transition: { duration: 0.12, ease: "easeIn" } },
};

export default function App({ Component, pageProps }) {
  const router = useRouter();
  // Key on the top-level segment so the three explore wizard steps share one
  // key — the wizard runs its own slide transitions and shouldn't also get the
  // global section cross-fade between steps.
  const sectionKey = router.route.split("/")[1] || "home";
  return (
    // reducedMotion="user" makes every Framer Motion component honor the OS
    // "reduce motion" setting (E1) without per-component wiring.
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ScrollbarReveal />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={sectionKey}
            variants={routeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Component {...pageProps} />
          </motion.div>
        </AnimatePresence>
      </ThemeProvider>
    </MotionConfig>
  );
}
