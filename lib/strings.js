// lib/strings.js — tiny shared string helpers.

// "san jose" → "San Jose". Splits on spaces, uppercases the first letter of
// each token. Safe on empty / non-string input.
export function toTitleCase(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
