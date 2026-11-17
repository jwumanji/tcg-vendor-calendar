import { useId } from "react";

/** Foil trading-card logo mark (same artwork as public/favicon.svg). Decorative. */
export function BrandMark({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg
      className={`brand-card ${className}`.trim()}
      viewBox="0 0 64 80"
      width="32"
      height="40"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6bd6" />
          <stop offset=".3" stopColor="#ffd24a" />
          <stop offset=".55" stopColor="#6bffb8" />
          <stop offset=".8" stopColor="#6bc8ff" />
          <stop offset="1" stopColor="#a58bff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="78" rx="10" fill={`url(#${id})`} />
      <rect x="5" y="5" width="54" height="70" rx="7" fill="#171431" />
      <g
        fill="none"
        stroke="#ffd24a"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m32 20 15 8-15 8-15-8z" />
        <path d="m17 40 15 8 15-8M17 52l15 8 15-8" />
      </g>
    </svg>
  );
}

/** Wordmark + sub-label. `as` lets the header render it inside a link. */
export function BrandLockup() {
  return (
    <>
      <BrandMark />
      <span className="brand-text">
        <span className="brand-word">Holo Vault</span>
        <span className="brand-sub">TCG Vendor Calendar</span>
      </span>
    </>
  );
}
