"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AgencyBrief } from "./AgencyBrief";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hiringManagerWork, agencyView, type SeatApp } from "@/lib/v2/seat-work";

/**
 * The hiring-manager and agency home screens.
 *
 * Both replace the recruiter's Jobs list for those seats. A hiring manager
 * sees what they owe; an agency sees where their own submissions stand. All
 * scoping rules live in lib/v2/seat-work (unit-tested) — this renders them.
 */
interface ApiRow {
  id: string;
  candidate_id: string;
  job_id: string;
  status?: string | null;
  source?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  jobs?: { title?: string | null } | null;
  candidates?: { name?: string | null } | null;
  fit_scores?: { overall_score?: number | null } | null;
}

function toSeatApps(rows: ApiRow[]): SeatApp[] {
  return rows.map((a) => ({
    id: a.id,
    candidateId: a.candidate_id,
    candidateName: a.candidates?.name?.trim() || "Unknown candidate",
    jobId: a.job_id,
    jobTitle: a.jobs?.title ?? "",
    status: a.status ?? "applied",
    score: a.fit_scores?.overall_score ?? null,
    createdAt: a.created_at ?? null,
    source: a.source ?? null,
    rejectionReason: a.rejection_reason ?? null,
  }));
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
      {children}
    </p>
  );
}

interface RequisitionRow {
  id: string;
  title?: string | null;
  status?: string | null;
  req_code?: string | null;
  assigned_job_id?: string | null;
  created_at?: string | null;
}

/**
 * The requisitions this manager has raised, and where each one stopped.
 *
 * Without it, raising a requisition is a form that swallows the request: the
 * manager gets no acknowledgement, no status, and asks the recruiter by email a
 * week later — which is the exact loop this seat exists to close. A draft that
 * was never submitted is called out separately, because "I raised it" and "it
 * is sitting in my drafts" feel identical from the outside and are not.
 */
export function RequisitionsInFlight({
  heading = "Requisitions you raised",
  limit,
  compact = false,
}: { heading?: string; limit?: number; compact?: boolean } = {}) {
  // For a hiring_manager the API already scopes this to created_by = them, so
  // "you raised" is literally true rather than an org-wide list mislabelled.
  const { data } = useApiQuery<{ requests: RequisitionRow[] }>("/api/hiring-requests", {
    limit: 20,
  });
  const rows = (data?.requests ?? []).filter((r) => r.status !== "converted");
  if (rows.length === 0) return null;
  const visibleRows = typeof limit === "number" ? rows.slice(0, limit) : rows;

  const label = (status: string | null | undefined) => {
    switch (status) {
      case "draft":
        return { text: "draft — not submitted", tone: "text-amber-300" };
      case "approved":
        return { text: "approved — recruiter is opening it", tone: "text-emerald-300" };
      case "rejected":
        return { text: "declined", tone: "text-red-300" };
      case "on_hold":
        return { text: "on hold", tone: "text-amber-300" };
      default:
        return { text: "waiting on approval", tone: "text-white/50" };
    }
  };

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/35">
          {heading}
        </h2>
        {compact ? (
          <Link
            href="/recruit/hiring-requests"
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>
      <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        {visibleRows.map((r) => {
          const state = label(r.status);
          return (
            <li key={r.id} className="border-b border-white/5 last:border-b-0">
              <Link
                href={`/company/hiring-requests/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                  {r.title?.trim() || "Untitled requisition"}
                  {r.req_code ? (
                    <span className="ml-2 font-mono text-xs text-white/35">{r.req_code}</span>
                  ) : null}
                </span>
                <span className={`shrink-0 text-xs ${state.tone}`}>{state.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {compact && rows.length > visibleRows.length ? (
        <p className="mt-2 text-xs text-white/45">
          {rows.length - visibleRows.length} more requisition
          {rows.length - visibleRows.length === 1 ? "" : "s"} waiting in Hiring Requests.
        </p>
      ) : null}
    </div>
  );
}

export function HiringManagerHome() {
  const { data, loading } = useApiQuery<{ applications: ApiRow[] }>("/api/applications", {
    limit: 100,
  });
  const work = hiringManagerWork(toSeatApps(data?.applications ?? []));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Your week</h1>
          <p className="text-sm text-white/55">
            {loading
              ? "Loading…"
              : work.totalOwed === 0
                ? "Nothing waiting on you."
                : `${work.totalOwed} ${work.totalOwed === 1 ? "person is" : "people are"} waiting on your decision`}
          </p>
        </div>
        {/* Raising a requisition is the FIRST thing this seat does — the flow is
            HM raises → leadership approves → recruiter works it. The redesign
            gave hiring managers a decision queue and no way to ask for a role
            at all, so the seat could not start the work it is accountable for.
            Route policy has always admitted them here; nothing linked to it. */}
        <Link
          href="/company/hiring-requests/new"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
        >
          + Raise a requisition
        </Link>
      </div>

      <RequisitionsInFlight />

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : work.totalOwed === 0 ? (
        <Empty>
          When a recruiter shortlists someone for one of your roles, they appear here. You will not
          see the wider applicant queue — that is the recruiter&apos;s work.
        </Empty>
      ) : (
        <>
          <ul className="mb-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
            {work.awaitingDecision.map((a) => (
              <li key={a.id} className="border-b border-white/5 last:border-b-0">
                <Link
                  href={`/recruit/v2/candidates/${a.candidateId}/scorecard?job=${a.jobId}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text)]">
                      {a.candidateName}
                    </span>
                    <span className="block truncate text-xs text-white/50">{a.jobTitle}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
                    Scorecard
                  </span>
                  <span
                    className={`shrink-0 text-xs ${
                      a.waitingDays >= 7
                        ? "text-red-300"
                        : a.waitingDays >= 3
                          ? "text-amber-300"
                          : "text-white/45"
                    }`}
                  >
                    {a.waitingDays === 0 ? "today" : `waiting ${a.waitingDays}d`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Your roles
          </h2>
          <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
            {work.byJob.map((g) => (
              <li key={g.jobId} className="border-b border-white/5 last:border-b-0">
                <Link
                  href={`/recruit/jobs/${g.jobId}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate text-[var(--text)]">{g.jobTitle}</span>
                  <span className="shrink-0 font-mono text-xs text-white/50">
                    {g.count} to decide
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function AgencyHome() {
  const { user } = useAuth();
  const { data, loading } = useApiQuery<{ applications: ApiRow[] }>("/api/applications", {
    limit: 100,
  });

  // Submissions are matched to this agency's own source tag; anything without
  // a matching tag is somebody else's and must never appear.
  const agencySource = user?.organisationId ? `agency:${user.organisationId}` : "";
  const rows = agencyView(toSeatApps(data?.applications ?? []), agencySource);
  // The brief is shown for the role this agency is most active on; showing one
  // rubric properly beats showing several as unreadable stubs.
  const brief = (data?.applications ?? []).find(
    (a) => a.job_id && rows.some((r) => r.jobTitle === a.jobs?.title),
  );

  return (
    <section>
      <h1 className="text-xl font-bold text-[var(--text)]">Your submissions</h1>
      <p className="mb-4 text-sm text-white/55">
        {loading ? "Loading…" : `${rows.length} candidate${rows.length === 1 ? "" : "s"} submitted`}
      </p>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <Empty>
          No submissions yet. Once you submit candidates they appear here with their live stage, so
          you never need to ask for an update.
        </Empty>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--text)]">
                  {r.candidateName}
                </span>
                <span className="block truncate text-xs text-white/50">{r.jobTitle}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-white/70">{r.stage}</span>
                <span className="block text-[11px] text-white/35">
                  {r.closedReason ? r.closedReason : `day ${r.waitingDays}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {brief ? (
        <AgencyBrief jobId={brief.job_id} jobTitle={brief.jobs?.title ?? "this role"} />
      ) : null}

      <p className="mt-3 text-xs text-white/35">
        You see your own candidates and their stage. Scores, internal notes and other agencies&apos;
        submissions are not shown.
      </p>
    </section>
  );
}
