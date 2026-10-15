"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { ASSESSMENT_STATUS_LABELS, ASSESSMENT_TYPE_LABELS } from "@/lib/assessments/constants";
import type { AssessmentStatus, AssessmentType } from "@/lib/assessments/constants";

/**
 * Where this candidate's assessment stands, on the profile that decides them.
 *
 * The assessment existed end-to-end — send, share link, submit, score — but
 * nowhere on the candidate profile, so the one screen a recruiter opens to
 * decide someone showed no sign that a test had been set, missed or failed.
 * People were advanced past unsubmitted assessments because the profile did not
 * mention them.
 *
 * A pending assessment past its deadline is called overdue rather than pending:
 * "pending" reads as waiting on the candidate when it is in fact a decision the
 * recruiter has to make.
 */
interface AssessmentRow {
  id: string;
  type?: AssessmentType | null;
  title?: string | null;
  status?: AssessmentStatus | null;
  deadline_at?: string | null;
  submitted_at?: string | null;
  score?: number | null;
  max_score?: number | null;
  pass_threshold_pct?: number | null;
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Overdue is a state the raw status column does not carry. */
function displayStatus(a: AssessmentRow): { label: string; tone: string } {
  const status = (a.status ?? "pending") as AssessmentStatus;
  if (status === "pending" && a.deadline_at) {
    const due = new Date(a.deadline_at);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
      return { label: "Overdue", tone: "bg-red-400/15 text-red-300" };
    }
  }
  const tone =
    status === "scored"
      ? "bg-emerald-400/15 text-emerald-300"
      : status === "submitted"
        ? "bg-sky-400/15 text-sky-300"
        : status === "expired"
          ? "bg-red-400/15 text-red-300"
          : "bg-amber-400/15 text-amber-300";
  return { label: ASSESSMENT_STATUS_LABELS[status] ?? status, tone };
}

/** "18/25 · 72%" — the raw score alone does not say whether it cleared. */
function scoreLine(a: AssessmentRow): string | null {
  if (a.score == null || !a.max_score) return null;
  const pct = Math.round((a.score / a.max_score) * 100);
  const threshold = a.pass_threshold_pct;
  const verdict = threshold == null ? "" : pct >= threshold ? " · cleared" : " · below bar";
  return `${a.score}/${a.max_score} · ${pct}%${verdict}`;
}

export function CandidateAssessmentState({ applicationId }: { applicationId: string | null }) {
  const { data, loading } = useApiQuery<{ assessments: AssessmentRow[] }>(
    applicationId ? "/api/assessments" : null,
    applicationId ? { applicationId } : undefined,
  );

  if (!applicationId) return null;

  const assessments = data?.assessments ?? [];

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
        Assessment
      </h2>
      {loading ? (
        <p className="text-xs text-white/50">Loading…</p>
      ) : assessments.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm text-white/55">
          No assessment set for this application.{" "}
          <Link href="/recruit/assessments" className="text-[var(--accent)] hover:underline">
            Set one
          </Link>
          .
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
          {assessments.map((a) => {
            const status = displayStatus(a);
            const score = scoreLine(a);
            const due = shortDate(a.deadline_at);
            const sent = shortDate(a.submitted_at);
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--text)]">
                    {a.title?.trim() ||
                      (a.type ? ASSESSMENT_TYPE_LABELS[a.type] : null) ||
                      "Assessment"}
                  </span>
                  <span className="block text-xs text-white/45">
                    {score ??
                      (sent
                        ? `submitted ${sent}`
                        : due
                          ? `due ${due}`
                          : "no deadline set — nothing chases this")}
                  </span>
                </span>
                <span className={`rounded px-2 py-0.5 font-mono text-[10px] ${status.tone}`}>
                  {status.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
