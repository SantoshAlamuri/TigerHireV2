"use client";

import Link from "next/link";
import { evaluateKnockouts, stageColumns, type KnockoutQuestion } from "@/lib/v2/knockouts";
import type { ScoreRow } from "@/lib/v2/score-index";

/**
 * The stage list as a table, because the columns are the point.
 *
 * A screened candidate is a hiring decision with logistics attached: a 79 with
 * a 15-day notice inside band is a different proposition from the same 79 at 90
 * days with two offers in hand. The previous list showed a score and a
 * location, which meant opening every profile to learn the thing that decides
 * whether to bother.
 */
export interface StageRow {
  id: string;
  candidate_id: string;
  status?: string | null;
  source?: string | null;
  expected_ctc_lpa?: number | null;
  notice_period_days?: number | null;
  candidates?: { name?: string | null; location?: string | null } | null;
  fit_scores?: { overall_score?: number | null } | null;
  application_screening_answers?:
    | { question_id?: string | null; answer_yes?: boolean | null }[]
    | null;
}

const CHIP: Record<string, string> = {
  pass: "bg-emerald-400/15 text-emerald-300",
  fail: "bg-red-400/15 text-red-300",
  partial: "bg-amber-400/15 text-amber-300",
  unanswered: "bg-white/[0.07] text-white/45",
  none: "bg-white/[0.07] text-white/45",
};

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[tone]}`}>
      {children}
    </span>
  );
}

export function StageTable({
  rows,
  stage,
  jobId,
  questions,
  scores,
}: {
  rows: StageRow[];
  stage: string;
  jobId: string;
  questions: KnockoutQuestion[];
  scores: Map<string, ScoreRow>;
}) {
  const columns = stageColumns(stage);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <table className="w-full min-w-[680px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = evaluateKnockouts(
              (r.application_screening_answers ?? []).map((a) => ({
                questionId: String(a.question_id ?? ""),
                answerYes: a.answer_yes ?? null,
              })),
              questions,
            );
            const notice = r.notice_period_days;
            const score = scores.get(r.candidate_id)?.overall_score;
            return (
              <tr
                key={r.id}
                className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-2 text-sm ${c.align === "right" ? "text-right font-mono tabular-nums" : ""}`}
                  >
                    {c.key === "candidate" ? (
                      <Link
                        href={`/recruit/candidates/${r.candidate_id}`}
                        className="font-semibold text-[var(--text)] hover:underline"
                      >
                        {r.candidates?.name?.trim() || "Unknown candidate"}
                      </Link>
                    ) : c.key === "score" ? (
                      <span className="font-semibold text-white/85">
                        {score ?? <span className="text-white/25">—</span>}
                      </span>
                    ) : c.key === "knockouts" ? (
                      <Chip tone={k.verdict}>{k.label}</Chip>
                    ) : c.key === "notice" ? (
                      notice == null ? (
                        <span className="text-white/25">—</span>
                      ) : (
                        <span className={notice >= 60 ? "text-amber-300" : "text-white/75"}>
                          {notice === 0 ? "Immediate" : `${notice}d`}
                        </span>
                      )
                    ) : c.key === "ctc" ? (
                      r.expected_ctc_lpa ? (
                        <span className="text-white/75">₹{r.expected_ctc_lpa}L</span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )
                    ) : c.key === "source" ? (
                      <span className="text-xs capitalize text-white/60">
                        {r.source?.replace(/_/g, " ") || "—"}
                      </span>
                    ) : c.key === "screening" ? (
                      <Chip tone={k.verdict}>{k.label}</Chip>
                    ) : c.key === "location" ? (
                      <span className="text-xs text-white/60">
                        {r.candidates?.location?.trim() || "—"}
                      </span>
                    ) : (
                      <span className="text-xs capitalize text-white/60">{r.status ?? "—"}</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
