"use client";

export type InsightStripProps = {
  insightBadge: string | null;
  insightBody: string | null;
};

export function InsightStrip({ insightBadge, insightBody }: InsightStripProps) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/[0.09] via-amber-500/[0.04] to-transparent px-4 py-3.5 ring-1 ring-inset ring-amber-500/10">
      {insightBadge ? (
        <span className="mt-0.5 shrink-0 rounded-full border border-amber-400/45 bg-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-100">
          {insightBadge}
        </span>
      ) : null}
      {insightBody ? (
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
          {insightBody}
        </p>
      ) : null}
    </div>
  );
}
