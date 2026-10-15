"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitPullRequest } from "../company-my-pipeline-icons";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { PipelineKanbanBoard } from "@/components/dashboard/PipelineKanbanBoard";
import type { PipelineCandidate } from "@/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard";

type TabFilter = "all" | "shortlisted" | "in_progress" | "hired" | "rejected";
type FocusMode = "needs-feedback" | "tomorrow-plan";

export default function HMPipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedJobId = searchParams.get("jobId");
  const [tab, setTab] = useState<TabFilter>("all");
  const { data, loading, error } = useApiQuery<{
    pipeline: PipelineCandidate[];
    stageCatalog?: Array<{ id: string; job_id: string; stage_name: string; stage_order: number }>;
  }>("/api/my-pipeline");

  const allEntries = data?.pipeline ?? [];
  const requestedFocus = searchParams.get("focus");
  const focusMode: FocusMode | null =
    requestedFocus === "needs-feedback" || requestedFocus === "tomorrow-plan"
      ? requestedFocus
      : null;
  const now = Date.now();
  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const roleFiltered = tab === "all" ? allEntries : allEntries.filter((e) => e.status === tab);
  const jobFiltered = selectedJobId
    ? roleFiltered.filter((entry) => entry.job_id === selectedJobId)
    : roleFiltered;
  const entries = jobFiltered.filter((entry) => {
    if (!focusMode) return true;
    const requiresFeedback =
      !!entry.interview_scheduled_at &&
      !entry.interview_outcome &&
      new Date(entry.interview_scheduled_at).getTime() < now;
    if (focusMode === "needs-feedback") return requiresFeedback;
    const isTomorrowInterview =
      !!entry.interview_scheduled_at &&
      new Date(entry.interview_scheduled_at).getTime() >= tomorrowStart.getTime() &&
      new Date(entry.interview_scheduled_at).getTime() < tomorrowEnd.getTime();
    return requiresFeedback || isTomorrowInterview;
  });

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: allEntries.length },
    {
      key: "shortlisted",
      label: "Shortlisted",
      count: allEntries.filter((e) => e.status === "shortlisted").length,
    },
    {
      key: "in_progress",
      label: "In Progress",
      count: allEntries.filter((e) => e.status === "in_progress").length,
    },
    { key: "hired", label: "Hired", count: allEntries.filter((e) => e.status === "hired").length },
    {
      key: "rejected",
      label: "Rejected",
      count: allEntries.filter((e) => e.status === "rejected").length,
    },
  ];

  return (
    <>
      <PageHeader title="Pipeline" subtitle="Track candidate progress across all your jobs" />
      {(focusMode || selectedJobId) && (
        <div className="card-lifted flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-sm text-[var(--text)]">
            {focusMode ? (
              <p>
                Focus mode:{" "}
                <span className="font-semibold text-[var(--accent)]">
                  {focusMode === "needs-feedback" ? "Needs feedback" : "Tomorrow plan"}
                </span>
              </p>
            ) : null}
            {selectedJobId ? (
              <p className="text-xs text-white/60">Showing candidates for this job only.</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => router.push("/company/my-pipeline")}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="card-lifted flex flex-wrap gap-2 p-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-[var(--accent)] text-black"
                : "border border-[var(--border)] text-white/60 hover:bg-white/[0.04]"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-xs">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-3 h-3 w-2/3" />
                <Skeleton className="mt-4 h-16 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="card-lifted flex flex-col items-center justify-center py-16">
          <GitPullRequest size={40} className="text-white/60" />
          <p className="text-body mt-4 text-white/60">No candidates in pipeline</p>
          <p className="text-body mt-1 text-sm text-white/60">
            Candidates will appear here once they enter the hiring pipeline
          </p>
        </div>
      ) : (
        <PipelineKanbanBoard
          candidates={entries}
          stageCatalog={data?.stageCatalog ?? []}
          updating={null}
          readOnly
          onStatusChange={() => {}}
        />
      )}
    </>
  );
}
