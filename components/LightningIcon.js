// components/LightningIcon.js — outlined bolt for nav / CTAs
export default function LightningIcon({ className, size = 18 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 2L4 14h7l-1 8 10-12h-7l0-8z" />
    </svg>
  );
}
