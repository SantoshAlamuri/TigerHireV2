"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { candidateListState, patchWorkspaceQuery } from "@/lib/v2/workspace-query";
import { useWorkspaceScroll } from "@/lib/v2/use-workspace-scroll";
import { useAuth } from "@/lib/auth/AuthProvider";
import { CandidateFilters } from "./CandidateFilters";
import { useCandidateRows } from "./useCandidateRows";
import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Candidates — grouped by job by default. Search refines; it is never required
 * for the page to tell you something useful.
 */
export interface ApiRow {
  id: string;
  candidate_id: string;
  job_id: string;
  status?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  notice_period_days?: number | null;
  expected_ctc_lpa?: number | null;
  offers_in_hand?: number | null;
  jobs?: { title?: string | null } | null;
  current_ctc_lpa?: number | null;
  candidates?: {
    name?: string | null;
    phone?: string | null;
    location?: string | null;
    experience_years?: number | null;
    skills?: string[] | null;
    intent_score?: number | null;
  } | null;
  fit_scores?: { overall_score?: number | null; scoring_method?: string | null } | null;
}

export default function RecruitV2CandidatesPage() {
  const searchParams = useSearchParams();
  const jobIdFocus = searchParams.get("jobId")?.trim() || null;
  const { user } = useAuth();
  const query = searchParams.toString();
  const { page, search, filters, openJobs } = candidateListState(new URLSearchParams(query));
  const [searchDraft, setSearchDraft] = useState(search);
  const updateQuery = (patch: Record<string, string | undefined>) => {
    const next = patchWorkspaceQuery(query, patch);
    window.history.replaceState(null, "", `/recruit/candidates${next ? `?${next}` : ""}`);
  };
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);
  useEffect(() => {
    if (searchDraft === search) return;
    const timer = window.setTimeout(() => {
      const next = patchWorkspaceQuery(query, {
        search: searchDraft.trim() || undefined,
        page: "1",
      });
      window.history.replaceState(null, "", `/recruit/candidates${next ? `?${next}` : ""}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search, query]);
  const setPage = (update: (previous: number) => number) =>
    updateQuery({ page: String(update(page)) });
  const setOpenJobs = (update: string[] | ((previous: string[]) => string[])) =>
    updateQuery({ expanded: (typeof update === "function" ? update(openJobs) : update).join(",") });
  const returnTo = `/recruit/candidates${query ? `?${query}` : ""}`;
  const { data, loading, error, refetch } = useApiQuery<{
    applications: ApiRow[];
    pagination?: { total: number; totalPages: number };
  }>("/api/applications", {
    limit: 30,
    page,
    jobId: jobIdFocus ?? undefined,
    search: search.trim() || undefined,
    jobTitle: filters.fn,
    location: filters.location,
    highIntentOnly: filters.highIntentOnly ? "true" : undefined,
  });

  useWorkspaceScroll(`${user?.id ?? "anonymous"}:${returnTo}`, !loading && !error);

  const rows = jobIdFocus
    ? (data?.applications ?? []).filter((row) => row.job_id === jobIdFocus)
    : (data?.applications ?? []);
  const focusedJobTitle =
    jobIdFocus && rows[0]?.jobs?.title?.trim() ? rows[0].jobs.title.trim() : null;
  const grouped = useCandidateRows(rows, "", {});

  // A search is an intent to see people, so matches expand automatically.
  const searching = search.trim().length > 0;
  const isOpen = (jobId: string) => jobId === jobIdFocus || searching || openJobs.includes(jobId);
  const allOpen = grouped.groups.length > 0 && grouped.groups.every((g) => isOpen(g.jobId));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Candidates</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {error
              ? "Applications unavailable"
              : loading
                ? "Loading…"
                : jobIdFocus
                  ? `${data?.pagination?.total ?? rows.length} applications · ${focusedJobTitle ?? "This job"}`
                  : `${data?.pagination?.total ?? rows.length} applications · grouped by job`}
          </p>
        </div>
        {jobIdFocus && (
          <Link
            href={`/recruit/v2/jobs/${jobIdFocus}/add`}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
          >
            Add candidates
          </Link>
        )}
        {jobIdFocus ? (
          <Link
            href="/recruit/candidates"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Show all jobs
          </Link>
        ) : null}
        {!jobIdFocus && (
          <button
            type="button"
            disabled={searching || !!jobIdFocus}
            onClick={() => setOpenJobs(allOpen ? [] : grouped.groups.map((g) => g.jobId))}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] disabled:opacity-40 hover:text-[var(--text)]"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
        <Link
          href="/recruit/v2/candidates/pool"
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Talent pool
        </Link>
      </div>

      <input
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        aria-label="Search candidates"
        placeholder="Search candidates by name"
        className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
      />

      {loading ? <Skeleton className="h-48 w-full" /> : null}

      <CandidateFilters
        functions={grouped.options.functions}
        locations={grouped.options.locations}
        value={filters}
        onChange={(value) => {
          updateQuery({
            jobTitle: value.fn,
            location: value.location,
            intent: value.highIntentOnly ? "high" : undefined,
            page: "1",
          });
        }}
        showing={grouped.groups.reduce((n, g) => n + g.rows.length, 0)}
        total={data?.pagination?.total ?? 0}
      />

      {loading ? null : error ? (
        // A failed load must never present as an empty pipeline — a recruiter
        // reads "no candidates" as truth and stops looking.
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="text-sm text-red-300">Couldn&apos;t load candidates. {error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-xs font-semibold text-red-200 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : grouped.groups.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-[var(--text-muted)]">
          {filters.fn || filters.location || filters.highIntentOnly
            ? "No candidates match these filters."
            : search
              ? "Nobody matches that search."
              : "No applications yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.groups.map((g) => (
            <div
              key={g.jobId}
              className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40"
            >
              <div className="flex items-center gap-2 border-b border-[var(--border)] bg-white/[0.02] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setOpenJobs((o) =>
                      o.includes(g.jobId) ? o.filter((x) => x !== g.jobId) : [...o, g.jobId],
                    )
                  }
                  aria-expanded={isOpen(g.jobId)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    aria-hidden
                    className={`shrink-0 font-mono text-xs text-[var(--text-muted)] transition-transform ${
                      isOpen(g.jobId) ? "rotate-90" : ""
                    }`}
                  >
                    ▶
                  </span>
                  <span className="truncate text-sm font-bold text-[var(--text)]">
                    {g.jobTitle}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
                    {g.rows.length}
                  </span>
                  {g.rows[0] ? (
                    <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
                      {g.rows[0].score != null ? `top ${g.rows[0].score}` : "unscored"}
                    </span>
                  ) : null}
                </button>
                <Link
                  href={`/recruit/jobs/${g.jobId}`}
                  className="shrink-0 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  job →
                </Link>
              </div>
              <div
                hidden={!isOpen(g.jobId)}
                className="grid grid-cols-[3rem_minmax(0,1fr)_6rem] gap-3 border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] sm:grid-cols-[3rem_minmax(0,1fr)_8rem_6rem]"
              >
                <span>Score</span>
                <span>Candidate</span>
                <span className="hidden sm:block">Location</span>
                <span>Status</span>
              </div>
              <ul hidden={!isOpen(g.jobId)}>
                {g.rows.map((r) => (
                  <li key={r.applicationId} className="border-b border-white/5 last:border-b-0">
                    <Link
                      href={`/recruit/candidates/${r.candidateId}?applicationId=${encodeURIComponent(r.applicationId)}&jobId=${encodeURIComponent(g.jobId)}&returnTo=${encodeURIComponent(returnTo)}`}
                      className="grid grid-cols-[3rem_minmax(0,1fr)_6rem] items-center gap-3 px-3 py-3 text-sm hover:bg-white/[0.03] sm:grid-cols-[3rem_minmax(0,1fr)_8rem_6rem]"
                    >
                      <span
                        className={
                          r.isFallbackScore
                            ? "font-mono text-amber-300"
                            : "font-mono text-[var(--text)]"
                        }
                        title={
                          r.isFallbackScore
                            ? "Keyword fallback score; review evidence before deciding"
                            : undefined
                        }
                      >
                        {r.score ?? "—"}
                        {r.isFallbackScore ? "*" : ""}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[var(--text)]">
                          {r.name}
                        </span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">
                          {r.experienceYears != null
                            ? `${r.experienceYears} years`
                            : "Experience unknown"}
                          {r.noticeDays != null
                            ? ` · ${r.noticeDays === 0 ? "Available now" : `${r.noticeDays} days notice`}`
                            : ""}
                        </span>
                      </span>
                      <span className="hidden truncate text-xs text-[var(--text-muted)] sm:block">
                        {r.location || "—"}
                      </span>
                      <span className="break-words text-xs capitalize text-[var(--text-muted)]">
                        {r.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <nav aria-label="Candidate pages" className="mt-4 flex items-center justify-between gap-3">
        <button
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm">
          Page {page} of {Math.max(1, data?.pagination?.totalPages ?? 1)}
        </span>
        <button
          disabled={loading || page >= (data?.pagination?.totalPages ?? 1)}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </nav>
    </section>
  );
}
