import Link from "next/link";

/**
 * The TigerHire mark (three claw strokes, orange to amber) with the wordmark
 * in lower case: "tigerhire".
 */
export function Brand({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <Link href={href} className="wd-brand" aria-label="tigerhire home">
      <svg viewBox="0 0 34 44" width="20" height="26" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="wd-claw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <g transform="translate(4, 2) rotate(-18, 16, 22)">
          <rect
            x="0"
            y="10"
            width="5.5"
            height="28"
            rx="2.75"
            fill="url(#wd-claw)"
            transform="skewX(-6)"
          />
          <rect
            x="9"
            y="2"
            width="5.5"
            height="38"
            rx="2.75"
            fill="url(#wd-claw)"
            transform="skewX(-6)"
          />
          <rect
            x="18"
            y="14"
            width="5.5"
            height="24"
            rx="2.75"
            fill="url(#wd-claw)"
            transform="skewX(-6)"
          />
        </g>
      </svg>
      {!compact && <span>tigerhire</span>}
    </Link>
  );
}
