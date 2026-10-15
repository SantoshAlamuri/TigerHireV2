"use client";
import { isDisplayableEvidence } from "@/lib/v2/evidence-pack";

import type { ReviewAppRow } from "./useEvidencePack";
import type { JobScore } from "./useReviewData";

type CriterionRow = {
  criterion_id?: string | null;
  criterion_name?: string | null;
  weight?: number | null;
  grade?: string | null;
  points_earned?: number | null;
  evidence_text?: string | null;
};

type CompareCandidate = {
  id: string;
  candidateId: string;
  name: string;
  score: number | null;
  criteria: CriterionRow[];
  flags: { green: number; amber: number; red: number };
  notice: number | null;
  expectedCtc: number | null;
};

function cleanCriteria(value: unknown): CriterionRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => (row && typeof row === "object" ? (row as CriterionRow) : null))
    .filter((row): row is CriterionRow => Boolean(row?.criterion_name || row?.criterion_id));
}

function criterionKey(row: CriterionRow): string {
  return (row.criterion_id || row.criterion_name || "").trim().toLowerCase();
}

function shortEvidence(value: string | null | undefined): string {
  const text = value?.trim();
  if (!isDisplayableEvidence(text)) return "No verified resume evidence available";
  return text.length > 92 ? `${text.slice(0, 89).trim()}...` : text;
}

function gradeTone(grade: string | null | undefined): string {
  const g = grade?.trim().toUpperCase();
  if (g === "A" || g === "B") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-300";
  if (g === "C") return "border-amber-400/35 bg-amber-500/10 text-amber-300";
  if (g === "D" || g === "F") return "border-red-400/35 bg-red-500/10 text-red-300";
  return "border-[var(--border)] bg-white/[0.03] text-[var(--text-muted)]";
}

function noticeText(days: number | null): string {
  if (days == null) return "-";
  if (days === 0) return "Immediate";
  return `${days}d`;
}

function ctcText(value: number | null): string {
  return value == null ? "-" : `Rs ${value}L`;
}

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-muted)]";
  if (score >= 75) return "text-emerald-300";
  if (score >= 55) return "text-amber-300";
  return "text-red-300";
}

function countFlags(values: (string | null)[] | null | undefined): number {
  return (values ?? []).filter((value) => (value ?? "").trim().length > 0).length;
}

function countCvQuotes(value: JobScore["evidence_json"]): number {
  return new Set(
    (value?.quotes ?? [])
      .map((item) => item.quote?.trim().toLowerCase().replace(/\s+/g, " "))
      .filter((quote): quote is string => Boolean(quote)),
  ).size;
}

export function ComparisonSnapshot({
  rowsById,
  queueOrder,
  scoresByCandidate,
}: {
  rowsById: Map<string, ReviewAppRow>;
  queueOrder: { id: string }[];
  scoresByCandidate: Map<string, JobScore>;
}) {
  const candidates: CompareCandidate[] = queueOrder
    .map((item) => {
      const row = rowsById.get(item.id);
      if (!row?.candidate_id) return null;
      const score = scoresByCandidate.get(row.candidate_id);
      return {
        id: row.id,
        candidateId: row.candidate_id,
        name: row.candidates?.name?.trim() || "Unknown candidate",
        score: score?.overall_score ?? null,
        criteria: cleanCriteria(score?.criteria_breakdown),
        flags: {
          green: countFlags(score?.green_flags) + countCvQuotes(score?.evidence_json),
          amber: countFlags(score?.amber_flags),
          red: countFlags(score?.red_flags),
        },
        notice: row.notice_period_days ?? null,
        expectedCtc: row.expected_ctc_lpa ?? null,
      };
    })
    .filter((row): row is CompareCandidate => Boolean(row))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 3);

  const criteria = new Map<string, CriterionRow>();
  for (const candidate of candidates) {
    for (const row of candidate.criteria) {
      const key = criterionKey(row);
      if (!key) continue;
      const existing = criteria.get(key);
      if (!existing || (row.weight ?? 0) > (existing.weight ?? 0)) criteria.set(key, row);
    }
  }
  const topCriteria = [...criteria.values()]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 5);

  if (candidates.length < 2) {
    return null;
  }

  if (topCriteria.length === 0) {
    return (
      <div className="mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Shortlist comparison</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Older scores do not have criterion breakdowns yet, so this compares the stored
              evidence shape.
            </p>
          </div>
          <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">
            top {candidates.length}
          </span>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-3">
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                    {candidate.name}
                  </p>
                  <p className={`font-mono text-xs tabular-nums ${scoreTone(candidate.score)}`}>
                    {candidate.score ?? "-"} FitScore
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 font-mono text-xs tabular-nums">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                    {candidate.flags.green}
                  </span>
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                    {candidate.flags.amber}
                  </span>
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-300">
                    {candidate.flags.red}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                Evidence: {candidate.flags.green} for, {candidate.flags.amber} to verify,{" "}
                {candidate.flags.red} gaps. Notice {noticeText(candidate.notice)} · expected{" "}
                {ctcText(candidate.expectedCtc)}.
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Side-by-side evidence</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Top candidates compared on the highest-weighted criteria in the approved bar.
          </p>
        </div>
        <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">
          top {candidates.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="w-[190px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Criterion
              </th>
              {candidates.map((candidate) => (
                <th key={candidate.id} className="px-3 py-2 text-left">
                  <span className="block truncate text-xs font-semibold text-[var(--text)]">
                    {candidate.name}
                  </span>
                  <span className={`font-mono text-xs tabular-nums ${scoreTone(candidate.score)}`}>
                    {candidate.score ?? "-"} FitScore
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topCriteria.map((criterion) => {
              const key = criterionKey(criterion);
              return (
                <tr key={key} className="border-b border-white/5 last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <span className="block text-sm font-semibold text-[var(--text-muted)]">
                      {criterion.criterion_name ?? "Criterion"}
                    </span>
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {criterion.weight ?? "-"}% weight
                    </span>
                  </td>
                  {candidates.map((candidate) => {
                    const row = candidate.criteria.find((item) => criterionKey(item) === key);
                    return (
                      <td key={`${candidate.id}-${key}`} className="px-3 py-2">
                        <span
                          className={`inline-flex min-w-7 justify-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${gradeTone(row?.grade)}`}
                        >
                          {row?.grade?.trim() || "-"}
                        </span>
                        <p className="mt-1 text-xs leading-snug text-[var(--text-muted)]">
                          {shortEvidence(row?.evidence_text)}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t border-[var(--border)] align-top">
              <td className="px-3 py-2 text-sm font-semibold text-[var(--text-muted)]">
                Logistics
              </td>
              {candidates.map((candidate) => (
                <td
                  key={`${candidate.id}-logistics`}
                  className="px-3 py-2 text-xs text-[var(--text-muted)]"
                >
                  Notice {noticeText(candidate.notice)}
                  <br />
                  Expected {ctcText(candidate.expectedCtc)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
