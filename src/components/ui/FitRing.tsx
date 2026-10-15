"use client";

import { scoreToTone, scoreToneColorVar } from "@/lib/score-tone";

type FitRingProps = {
  score: number;
  size?: number;
  showLabel?: boolean;
  showCenterValue?: boolean;
};

export default function FitRing({
  score,
  size = 56,
  showLabel = true,
  showCenterValue = true,
}: FitRingProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeWidth = size * 0.0625;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedScore / 100);

  // Shared 0–100 score ramp — same thresholds/colours as every score pill (F-03).
  const isStrong = scoreToTone(clampedScore) === "strong";
  const ringColor = scoreToneColorVar(clampedScore);

  return (
    <div className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={isStrong ? { filter: "drop-shadow(0 0 6px rgba(74, 222, 128, 0.55))" } : undefined}
        />
        {showCenterValue ? (
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            fill="white"
            className="font-extrabold tabular-nums [font-variant-numeric:tabular-nums]"
            fontSize={size * 0.285}
            opacity={0.96}
          >
            {Math.round(clampedScore)}
          </text>
        ) : null}
      </svg>
      {showLabel ? (
        <span className="text-caption uppercase tracking-[0.07em] text-[var(--text-subtle)]">
          fit
        </span>
      ) : null}
    </div>
  );
}
