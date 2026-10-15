"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
import { JobsViewSwitch } from "@/components/dashboard/JobsViewSwitch";
import { JobsListRows, type JobRow } from "./JobsListRows";

const PAGE_SIZE = 20;
const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "draft", label: "Drafts" },
  { value: "closed", label: "Closed" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/** One list implementation; compatibility company URL keeps its detail/back context. */
export function JobsListWorkspace({
  basePath = "/recruit/jobs",
}: {
  basePath?: "/recruit/jobs" | "/company/jobs";
}) {
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFilter = searchParams.get("status") ?? "all";
  const filter: Filter = FILTERS.some((item) => item.value === rawFilter)
    ? (rawFilter as Filter)
    : "all";
  const rawPage = Number(searchParams.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = searchParams.get("search") ?? "";
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);
  const { data, loading, error, refetch } = useApiQuery<{
    jobs: JobRow[];
    pagination: { total: number; totalPages: number };
  }>(user ? "/api/jobs" : null, {
    view: "summary",
    limit: PAGE_SIZE,
    page,
    status: filter === "all" ? undefined : filter,
    search: search || undefined,
  });
  const busy = loading || !user;
  const jobs = data?.jobs ?? [];
  const total = data?.pagination.total;
  const totalPages = data?.pagination.totalPages ?? 1;
  const canCreate =
    user?.role === "recruiter" || user?.role === "leadership" || user?.role === "hiring_manager";

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  }

  return (
    <section className="hiring-workspace space-y-4" aria-label="Jobs workspace">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Jobs</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Choose a role to continue hiring.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {basePath === "/recruit/jobs" && caps.viewPortfolio && <JobsViewSwitch current="list" />}
          <Link
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            href="/company/hiring-requests"
          >
            Hiring requests
          </Link>
          {canCreate && (
            <Link
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              href="/company/hiring-requests/new"
            >
              New hiring request
            </Link>
          )}
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Job status">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() =>
                navigate({ status: item.value === "all" ? null : item.value, page: null })
              }
              className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${filter === item.value ? "border border-[var(--border-interactive)] bg-[var(--surface-hover)] text-[var(--text)]" : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ search: searchDraft.trim() || null, page: null });
          }}
          role="search"
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3">
            <Search size={16} aria-hidden className="text-[var(--text-muted)]" />
            <input
              aria-label="Search jobs"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search jobs"
              className="min-w-0 bg-transparent py-2 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </label>
          <button className="rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            Search
          </button>
        </form>
      </div>
      <div aria-live="polite" className="text-xs text-[var(--text-muted)]">
        {busy
          ? "Loading jobs…"
          : error
            ? "Jobs unavailable"
            : `${total ?? jobs.length} role${total === 1 ? "" : "s"}${search ? ` matching “${search}”` : ""}`}
      </div>
      {busy ? (
        <div className="space-y-2" aria-label="Loading jobs">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 p-5 text-sm text-[var(--text)]"
        >
          <p>Couldn’t load jobs.</p>
          <button
            onClick={() => void refetch()}
            className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Retry
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] p-8 text-center">
          <h2 className="font-semibold text-[var(--text)]">
            {search
              ? "No matching jobs"
              : filter === "all" && page === 1
                ? "No jobs yet"
                : `No ${filter === "all" ? "more" : filter} jobs`}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {search || filter !== "all"
              ? "Try another search or status."
              : "Start with a hiring request. Approved requests become jobs."}
          </p>
          {(search || filter !== "all" || page > 1) && (
            <button
              onClick={() => navigate({ search: null, status: null, page: null })}
              className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Show all jobs
            </button>
          )}
        </div>
      ) : (
        <JobsListRows jobs={jobs} basePath={basePath} />
      )}
      {!busy && !error && (totalPages > 1 || page > 1) && (
        <nav
          aria-label="Jobs pagination"
          className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]"
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => navigate({ page: page > 2 ? String(page - 1) : null })}
            className="rounded-lg border border-[var(--border)] px-3 py-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(page, totalPages)}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => navigate({ page: String(page + 1) })}
            className="rounded-lg border border-[var(--border)] px-3 py-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
