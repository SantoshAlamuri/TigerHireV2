"use client";

import { useId } from "react";

type SparklineTone = "positive" | "negative" | "neutral";

const TONE_STROKE: Record<SparklineTone, string> = {
  positive: "var(--status-success-fg, #4ade80)",
  negative: "var(--status-danger-fg, #f87171)",
  neutral: "var(--accent)",
};

/**
 * Compact single-series trend mark for a KPI card.
 * Thin 2px line + light area fill, no axes/legend (the card title names the series),
 * theme-aware via CSS tokens. Renders nothing when there is no usable series.
 */
export function Sparkline({
  data,
  tone = "neutral",
  width = 132,
  height = 34,
  ariaLabel,
}: {
  data: number[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const gradientId = useId();
  const points = (data ?? []).filter((n) => Number.isFinite(n));
  if (points.length < 2) return null;

  const stroke = TONE_STROKE[tone];
  const pad = 2;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const coords = points.map((value, i) => {
    const x = pad + (i / (points.length - 1)) * innerW;
    // Flat series sits on the baseline rather than mid-height.
    const y = pad + innerH - ((value - min) / range) * innerH;
    return [x, y] as const;
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0]} ${height - pad} L${coords[0][0]} ${height - pad} Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "Trend sparkline"}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} stroke="var(--surface)" strokeWidth={1} />
    </svg>
  );
}
