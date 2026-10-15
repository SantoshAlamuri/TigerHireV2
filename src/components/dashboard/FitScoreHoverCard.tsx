"use client";

interface FitScoreHoverCardProps {
  band?: string | null;
  confidence?: string | null;
  strengths?: string[] | null;
  gaps?: string[] | null;
}

export function FitScoreHoverCard({ band, confidence, strengths, gaps }: FitScoreHoverCardProps) {
  const topStrengths = (strengths ?? []).filter(Boolean).slice(0, 2);
  const topGap = (gaps ?? []).filter(Boolean)[0];

  return (
    <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-xl group-hover:block">
      <p className="text-xs font-semibold text-[var(--text)]">{band ?? "Fit score insight"}</p>
      {confidence ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{confidence} confidence</p>
      ) : null}
      <div className="mt-2 space-y-1">
        {topStrengths.map((item) => (
          <p key={item} className="text-xs text-emerald-300">
            + {item}
          </p>
        ))}
        {topGap ? <p className="text-xs text-amber-300">- {topGap}</p> : null}
        {topStrengths.length === 0 && !topGap ? (
          <p className="text-xs text-[var(--text-subtle)]">No score explanation available yet.</p>
        ) : null}
      </div>
    </div>
  );
}
