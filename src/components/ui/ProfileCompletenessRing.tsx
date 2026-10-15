"use client";

import { useId, useMemo } from "react";

/** Circular gauge with centered percentage for profile completeness UIs. */
export function ProfileCompletenessRing({
  value,
  size = 88,
  strokeWidth = 4,
  showCenterValue = true,
  className = "",
}: {
  value: number;
  /** Outer SVG width/height in px */
  size?: number;
  strokeWidth?: number;
  showCenterValue?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const half = size / 2;
  const pad = strokeWidth / 2 + 3;
  const r = half - pad;
  const c = 2 * Math.PI * r;
  const dashOffset = c - (pct / 100) * c;
  const uid = useId();
  const gradId = `pcr-grad-${uid.replace(/:/g, "")}`;

  const { trackClass, gradFrom, gradTo, glow } = useMemo(() => {
    if (pct >= 80) {
      return {
        trackClass: "text-white/[0.07]",
        gradFrom: "#6ee7b7",
        gradTo: "#34d399",
        glow: "rgba(52, 211, 153, 0.35)",
      };
    }
    if (pct >= 60) {
      return {
        trackClass: "text-white/[0.07]",
        gradFrom: "#fcd34d",
        gradTo: "#f59e0b",
        glow: "rgba(245, 158, 11, 0.32)",
      };
    }
    return {
      trackClass: "text-white/[0.07]",
      gradFrom: "#fda4af",
      gradTo: "#fb7185",
      glow: "rgba(251, 113, 133, 0.3)",
    };
  }, [pct]);

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Profile completeness ${pct} percent`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradFrom} />
            <stop offset="100%" stopColor={gradTo} />
          </linearGradient>
        </defs>
        <circle
          cx={half}
          cy={half}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={trackClass}
        />
        <circle
          cx={half}
          cy={half}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          style={{
            filter: `drop-shadow(0 0 ${Math.max(4, size / 14)}px ${glow})`,
          }}
        />
      </svg>
      {showCenterValue ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-baseline gap-px tabular-nums tracking-tight">
            <span
              className="font-bold leading-none text-[var(--text)]"
              style={{ fontSize: Math.max(13, Math.round(size * 0.26)) }}
            >
              {pct}
            </span>
            <span
              className="font-semibold text-white/42"
              style={{ fontSize: Math.max(9, Math.round(size * 0.17)) }}
            >
              %
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
