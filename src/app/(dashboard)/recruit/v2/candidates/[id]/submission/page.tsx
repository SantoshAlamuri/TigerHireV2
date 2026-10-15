"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
import { ownershipUntil, submissionSteps, VISIBILITY } from "@/lib/v2/agency-submission";

/**
 * One submission, as its agency is allowed to see it.
 *
 * Bounded transparency: enough truth that the partner never needs to email
 * "any update?", and hard walls around competitive information. The boundary is
 * printed at the bottom rather than discovered through an awkward call.
 *
 * The page reads only the fields the boundary permits — no score is fetched,
 * so none can leak through a future edit. Enforcement lives in
 * lib/v2/agency-submission, which is unit-tested.
 */
interface AppRow {
  id: string;
  candidate_id: string;
  job_id: string;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  rejection_reason?: string | null;
  jobs?: { title?: string | null } | null;
  candidates?: { name?: string | null } | null;
  application_screening_answers?: Array<{ question_id: string }> | null;
}

export default function AgencySubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);

  const { data, loading } = useApiQuery<{ applications: AppRow[] }>(
    id ? "/api/applications" : null,
    id ? { candidateId: id, limit: 10 } : undefined,
  );

  if (!id) return null;

  if (!caps.viewOwnSubmissions && !caps.viewAllCandidates) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-xl font-bold text-[var(--text)]">Not your seat</h1>
        <p className="mt-2 text-sm text-white/60">This view belongs to the submitting partner.</p>
      </section>
    );
  }

  const app = data?.applications?.[0] ?? null;

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!app) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-xl font-bold text-[var(--text)]">No submission found</h1>
        <p className="mt-2 text-sm text-white/60">
          Either this candidate was not submitted by you, or the submission has been removed.
        </p>
      </section>
    );
  }

  const submittedAt = app.created_at ?? null;
  const answered = (app.application_screening_answers?.length ?? 0) > 0;
  const steps = submissionSteps({
    status: app.status ?? "applied",
    submittedAt,
    // The answer rows carry no timestamp on this endpoint, so the submission
    // date stands in for "answered" rather than inventing one.
    screeningAnsweredAt: answered ? submittedAt : null,
    scoredAt:
      app.status && ["shortlisted", "hired", "rejected"].includes(app.status)
        ? (app.updated_at ?? null)
        : null,
    interviewAt: null,
    rejectionReason: app.rejection_reason ?? null,
  });
  const owned = ownershipUntil(submittedAt);

  return (
    <section className="max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">
            {app.candidates?.name?.trim() || "Your candidate"}
          </h1>
          <p className="text-sm text-white/55">
            your submission · {app.jobs?.title ?? "this role"}
            {owned
              ? ` · ownership until ${new Date(owned).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
              : ""}
          </p>
        </div>
        <Link
          href="/recruit/jobs"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Your submissions
        </Link>
      </div>

      <ol className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        {steps.map((s) => (
          <li
            key={s.label}
            className="flex gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                s.state === "done"
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                  : s.state === "current"
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] text-white/30"
              }`}
            >
              {s.state === "done" ? "✓" : s.state === "current" ? "…" : ""}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-semibold ${
                  s.state === "pending" ? "text-white/40" : "text-[var(--text)]"
                }`}
              >
                {s.label}
              </span>
              <span className="block text-xs text-white/50">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
        What you can and cannot see — by design
      </h2>
      <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        {VISIBILITY.map((v) => (
          <li
            key={v.text}
            className="flex items-start gap-3 border-b border-white/5 px-4 py-2.5 last:border-b-0"
          >
            <span
              className={`mt-0.5 shrink-0 font-mono text-xs ${v.allowed ? "text-emerald-300" : "text-red-300"}`}
            >
              {v.allowed ? "✓" : "✗"}
            </span>
            <span className="min-w-0 flex-1 text-sm text-white/70">{v.text}</span>
            <span className="shrink-0 font-mono text-[10px] text-white/35">{v.when}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
