"use client";

import { ProgressBarFill } from "@/components/dashboard/ProgressBarFill";

function getBarColor(score: number): string {
  if (score >= 90) return "bg-emerald-400";
  if (score >= 75) return "bg-amber-400";
  if (score >= 60) return "bg-orange-400";
  return "bg-red-400";
}

interface DimensionBarProps {
  label: string;
  value: number;
  reasoning?: string;
}

export function DimensionBar({ label, value, reasoning }: DimensionBarProps) {
  const color = getBarColor(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="w-40 shrink-0 text-body text-sm text-[var(--text-muted)]">{label}</span>
        <ProgressBarFill value={value} fillClassName={color} />
        <span className="w-10 shrink-0 text-right text-body text-sm font-medium text-[var(--text)]">
          {value}%
        </span>
      </div>
      {reasoning && <p className="pl-0 text-xs text-[var(--text-muted)] md:pl-0">{reasoning}</p>}
    </div>
  );
}
