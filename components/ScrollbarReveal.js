// components/ScrollbarReveal.js — toggles html.scrollbar-reveal while scrolling (fade via CSS transition)
import { useEffect } from "react";

const CLASS_NAME = "scrollbar-reveal";
const HIDE_MS = 900;

export default function ScrollbarReveal() {
  useEffect(() => {
    const root = document.documentElement;
    let hideTimer;

    function reveal() {
      root.classList.add(CLASS_NAME);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        root.classList.remove(CLASS_NAME);
      }, HIDE_MS);
    }

    window.addEventListener("scroll", reveal, { passive: true });
    return () => {
      window.removeEventListener("scroll", reveal);
      window.clearTimeout(hideTimer);
      root.classList.remove(CLASS_NAME);
    };
  }, []);

  return null;
}
