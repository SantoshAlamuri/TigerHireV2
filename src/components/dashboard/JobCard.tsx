"use client";

import type { JobPosting } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getJobPriorityTone, type StatusTone } from "@/lib/status-tones";

interface JobCardProps {
  job: JobPosting;
  onClick?: () => void;
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getPriorityAccentColor(tone: StatusTone): string {
  if (tone === "danger") return "bg-[color:var(--status-danger-fg)]";
  if (tone === "warning") return "bg-[color:var(--status-warning-fg)]";
  if (tone === "info") return "bg-[color:var(--status-info-fg)]";
  if (tone === "success") return "bg-[color:var(--status-success-fg)]";
  return "bg-[color:var(--status-neutral-fg)]";
}

function formatSalary(min: number, max: number): string {
  const minL = (min / 100000).toFixed(0);
  const maxL = (max / 100000).toFixed(0);
  return `₹${minL}–${maxL}L/yr`;
}

export default function JobCard({ job, onClick }: JobCardProps) {
  const skills = job.skillsRequired.slice(0, 4);
  const priorityTone = getJobPriorityTone(job.internalPriority);
  const priorityAccent = getPriorityAccentColor(priorityTone);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`card-lifted card-lifted-hover relative flex min-h-[180px] flex-col gap-4 overflow-hidden rounded-xl p-5 sm:h-[180px] ${
        onClick
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          : ""
      }`}
    >
      {/* Left border accent that follows rounded corners */}
      <div className={`absolute left-0 top-0 h-full w-1 ${priorityAccent} rounded-l-xl`} />

      <div className="min-w-0 pr-1">
        <h3 className="truncate text-lg font-semibold leading-tight text-[var(--text)]">
          {job.titleNormalised}
        </h3>
      </div>

      {skills.length > 0 && (
        <div className="flex max-h-[4.75rem] flex-wrap gap-2 overflow-hidden">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-body text-xs text-[var(--text-muted)]"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto grid gap-3 border-t border-[var(--border)]/70 pt-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0">
          <p className="text-body truncate text-sm text-[var(--text-muted)]">
            {job.location || "Not specified"}
          </p>
        </div>
        <span className="text-body text-sm tabular-nums text-[var(--text-muted)] [font-variant-numeric:tabular-nums]">
          {formatSalary(job.salaryMin, job.salaryMax)}
        </span>
        <div className="flex items-center gap-2 sm:justify-end">
          <span className="text-body text-xs text-[var(--text-subtle)]">
            {formatRelativeDate(job.postedDate)}
          </span>
          <StatusBadge
            tone={job.matchedCandidatesCount > 0 ? "info" : "neutral"}
            size="sm"
            className="text-body font-medium"
          >
            {job.matchedCandidatesCount} matched
          </StatusBadge>
        </div>
      </div>
    </div>
  );
}
