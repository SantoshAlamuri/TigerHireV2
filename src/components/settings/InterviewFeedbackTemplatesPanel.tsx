"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { FeedbackTemplatesBlock } from "@/app/(dashboard)/recruit/jobs/[id]/components/FeedbackTemplatesBlock";

type JobRow = { id: string; title: string | null; status?: string | null };

// The feedback-templates editor page only exists under /recruit/jobs/[id]; the role-based
// jobsBasePath (e.g. /company/jobs for leadership) has no such route and 404s, so the editor
// link is fixed to the recruit path. The prop is kept for call-site compatibility.
export function InterviewFeedbackTemplatesPanel({
  jobsBasePath: _jobsBasePath,
}: {
  jobsBasePath: string;
}) {
  // Feedback templates are reusable per-job presets you set up while building a role — so list
  // ALL the org's jobs (draft/open/closed): omit `status` (the jobs API returns every status when
  // it's absent). limit must stay <= 100 — the jobs API caps it and 400s above that, which was
  // silently emptying this picker even for orgs with jobs.
  const { data: jobsData, loading: jobsLoading } = useApiQuery<{ jobs: JobRow[] }>("/api/jobs", {
    limit: 100,
  });
  const jobs = useMemo(
    () =>
      (jobsData?.jobs ?? [])
        .filter((job) => job.id)
        .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    [jobsData?.jobs],
  );

  const [jobId, setJobId] = useState("");
  useEffect(() => {
    if (jobId || jobs.length === 0) return;
    setJobId(jobs[0]!.id);
  }, [jobId, jobs]);

  const {
    data: templatesData,
    loading: templatesLoading,
    refetch,
  } = useApiQuery<{ templates: { id: string; name: string; fields: unknown[] }[] }>(
    jobId ? `/api/jobs/${jobId}/feedback-templates` : null,
  );
  const templates = templatesData?.templates ?? [];
  const selectedJob = jobs.find((job) => job.id === jobId);

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-white/60">
        Interview feedback forms are stored per job posting. Choose a role below to add presets or
        open the full editor to attach templates to pipeline stages.
      </p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-white/55">Job posting</span>
          <select
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            disabled={jobsLoading || jobs.length === 0}
            className="min-h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
          >
            {jobs.length === 0 ? (
              <option value="">No jobs yet</option>
            ) : (
              jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {(job.title?.trim() || "Untitled role") +
                    (job.status && job.status !== "open" ? ` (${job.status})` : "")}
                </option>
              ))
            )}
          </select>
        </label>
        {jobId ? (
          <Link
            href={`/recruit/jobs/${jobId}/feedback-templates`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--accent)] hover:bg-white/[0.04]"
          >
            Full editor
            <ExternalLink size={14} aria-hidden />
          </Link>
        ) : null}
      </div>

      {jobsLoading ? (
        <div className="h-24 animate-pulse rounded-xl border border-[var(--border)]/30 bg-[var(--surface)]/40" />
      ) : null}

      {!jobsLoading && jobs.length === 0 ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          No jobs in this organisation yet. Create a job first, then return here to configure
          feedback templates.
        </p>
      ) : null}

      {jobId && !templatesLoading ? (
        <div className="card-lifted p-4">
          {selectedJob ? (
            <p className="mb-3 text-xs text-white/50">
              Templates for{" "}
              <span className="font-medium text-white/80">
                {selectedJob.title?.trim() || "Untitled role"}
              </span>
            </p>
          ) : null}
          <FeedbackTemplatesBlock
            jobId={jobId}
            templates={templates}
            onSaved={() => void refetch()}
          />
        </div>
      ) : null}

      {jobId && templatesLoading ? (
        <div className="h-20 animate-pulse rounded-xl border border-[var(--border)]/30 bg-[var(--surface)]/40" />
      ) : null}
    </div>
  );
}
