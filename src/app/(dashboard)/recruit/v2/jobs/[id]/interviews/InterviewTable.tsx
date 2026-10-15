"use client";

/**
 * Booked interviews, with the scorecard state beside each one.
 *
 * The scorecard column is the reason this table exists. An interview that
 * happened days ago with no feedback recorded is the single most common way a
 * pipeline stalls, and it is invisible on a list that only shows who is booked
 * when. Overdue is computed from the schedule, not typed by anyone.
 */
export interface InterviewRow {
  slotId: string;
  candidateName?: string | null;
  scheduledStart?: string | null;
  stageName?: string | null;
  feedbackSubmitted?: boolean;
  interviewerName?: string | null;
}

function when(iso: string | null | undefined): { text: string; past: boolean; days: number } {
  if (!iso) return { text: "not scheduled", past: false, days: 0 };
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return { text: "not scheduled", past: false, days: 0 };
  const past = ms < Date.now();
  return {
    text: new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ms),
    past,
    days: Math.floor((Date.now() - ms) / 86_400_000),
  };
}

export function InterviewTable({
  rows,
  scoreFor,
}: {
  rows: InterviewRow[];
  scoreFor: (name: string | null | undefined) => number | null;
}) {
  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
            <th className="px-4 py-2 text-left font-medium">Candidate</th>
            <th className="px-3 py-2 text-right font-medium">FitScore</th>
            <th className="px-3 py-2 text-left font-medium">Stage</th>
            <th className="px-3 py-2 text-left font-medium">When</th>
            <th className="px-4 py-2 text-left font-medium">Scorecard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = when(r.scheduledStart);
            const score = scoreFor(r.candidateName);
            const overdue = w.past && !r.feedbackSubmitted;
            return (
              <tr key={r.slotId} className="border-b border-white/5 last:border-b-0">
                <td className="px-4 py-2 text-sm font-semibold text-[var(--text)]">
                  {r.candidateName?.trim() || "Candidate"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/80">
                  {score ?? <span className="text-white/25">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-white/65">{r.stageName || "Interview"}</td>
                <td className="px-3 py-2 text-xs text-white/55">{w.text}</td>
                <td className="px-4 py-2 text-xs">
                  {r.feedbackSubmitted ? (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      submitted
                    </span>
                  ) : overdue ? (
                    <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[11px] font-medium text-red-300">
                      overdue {w.days === 0 ? "today" : `${w.days}d`}
                      {r.interviewerName ? ` — ${r.interviewerName}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/45">
                      after interview
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
