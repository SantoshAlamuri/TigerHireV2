"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { jobPublicationState } from "@/lib/jobs/publication-state";

export interface JobRow {
  id: string;
  title: string;
  status?: string | null;
  location?: string | null;
  created_at?: string | null;
  is_active?: boolean | null;
  list_on_public_job_board?: boolean | null;
  applications?: Array<{ count: number }>;
}

/** The job rows of the shared jobs list. Split out of JobsListWorkspace for the file-size gate. */
export function JobsListRows({ jobs, basePath }: { jobs: JobRow[]; basePath: string }) {
  return (
    <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {jobs.map((job) => {
        const state = jobPublicationState(job);
        const count = job.applications?.[0]?.count;
        const action =
          job.status === "draft"
            ? "Finish setup"
            : job.status === "closed"
              ? "View job"
              : "Open workspace";
        return (
          <li key={job.id}>
            <Link
              href={`${basePath}/${encodeURIComponent(job.id)}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-[var(--text)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
            >
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate font-semibold">{job.title}</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  {job.location?.trim() || "Location not set"}
                </span>
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs ${state.publicApplications ? "border-emerald-500/40 text-emerald-400" : "border-[var(--border)] text-[var(--text-muted)]"}`}
              >
                {state.label}
              </span>
              <span className="text-xs tabular-nums text-[var(--text-muted)] sm:min-w-24 sm:text-right">
                {typeof count === "number"
                  ? `${count} candidate${count === 1 ? "" : "s"}`
                  : "Count unavailable"}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium">
                {action}
                <ArrowRight size={14} aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
