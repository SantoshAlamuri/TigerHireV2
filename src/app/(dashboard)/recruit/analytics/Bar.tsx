"use client";

/** A labelled proportion bar, shared by the funnel and the fairness view. */
export function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-28 shrink-0 text-xs text-white/60">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <span
          className="block h-full rounded-full bg-[var(--accent)]/70"
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-white/70">
        {value} · {width}%
      </span>
    </div>
  );
}
