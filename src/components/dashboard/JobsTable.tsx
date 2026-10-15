"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { JobPosting } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getJobPriorityTone, type StatusTone } from "@/lib/status-tones";

interface JobsTableProps {
  jobs: JobPosting[];
  onRowClick?: (id: string) => void;
  /** Show a Client column (companyName) — used by the agency view, which spans clients. */
  showClient?: boolean;
}

type SortKey = "title" | "client" | "location" | "salary" | "age" | "matched";
type SortDir = "asc" | "desc";

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
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

function formatSalary(min: number, max: number): string {
  const minL = (min / 100000).toFixed(0);
  const maxL = (max / 100000).toFixed(0);
  return `₹${minL}–${maxL}L/yr`;
}

function priorityAccent(tone: StatusTone): string {
  if (tone === "danger") return "bg-[color:var(--status-danger-fg)]";
  if (tone === "warning") return "bg-[color:var(--status-warning-fg)]";
  if (tone === "info") return "bg-[color:var(--status-info-fg)]";
  if (tone === "success") return "bg-[color:var(--status-success-fg)]";
  return "bg-[color:var(--status-neutral-fg)]";
}

const SORTABLE: Record<SortKey, boolean> = {
  title: true,
  client: true,
  location: true,
  salary: true,
  age: true,
  matched: true,
};

export default function JobsTable({ jobs, onRowClick, showClient = false }: JobsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<SortDir>("asc"); // "asc" on age = newest first (smallest age)

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    const rows = [...jobs];
    rows.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return factor * a.titleNormalised.localeCompare(b.titleNormalised);
        case "client":
          return factor * (a.companyName || "").localeCompare(b.companyName || "");
        case "location":
          return factor * (a.location || "").localeCompare(b.location || "");
        case "salary":
          return factor * (a.salaryMin - b.salaryMin);
        case "age":
          // newest first when asc: larger postedDate (more recent) should sort first,
          // so invert the raw comparison relative to `factor`.
          return -factor * (new Date(a.postedDate).getTime() - new Date(b.postedDate).getTime());
        case "matched":
          return factor * (a.matchedCandidatesCount - b.matchedCandidatesCount);
        default:
          return 0;
      }
    });
    return rows;
  }, [jobs, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (!SORTABLE[key]) return;
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const renderSortHeader = (label: string, col: SortKey, align: "left" | "right" = "left") => {
    const active = sortKey === col;
    const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className={`inline-flex items-center gap-1.5 rounded transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
            align === "right" ? "flex-row-reverse" : ""
          } ${active ? "text-[var(--text)]" : ""}`}
        >
          {label}
          <Icon size={13} className={active ? "text-[var(--accent)]" : "opacity-50"} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div className="card-lifted overflow-x-auto rounded-xl p-0">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {renderSortHeader("Job Title", "title")}
            {showClient ? renderSortHeader("Client", "client") : null}
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Skills
            </th>
            {renderSortHeader("Location", "location")}
            {renderSortHeader("Salary", "salary")}
            {renderSortHeader("Age", "age")}
            {renderSortHeader("Matched", "matched", "right")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((job) => {
            const tone = getJobPriorityTone(job.internalPriority);
            const skills = job.skillsRequired.slice(0, 3);
            const extra = job.skillsRequired.length - skills.length;
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={job.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onRowClick?.(job.id) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick?.(job.id);
                        }
                      }
                    : undefined
                }
                className={`border-b border-[var(--border)]/60 transition-colors last:border-0 ${
                  clickable
                    ? "cursor-pointer hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-none"
                    : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-6 w-1 shrink-0 rounded-full ${priorityAccent(tone)}`}
                      aria-hidden
                    />
                    <span className="font-medium text-[var(--text)]">{job.titleNormalised}</span>
                  </div>
                </td>
                {showClient ? (
                  <td className="px-4 py-3 text-[var(--text-muted)]">{job.companyName || "—"}</td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]"
                      >
                        {s}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="text-xs text-[var(--text-subtle)]">+{extra}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {job.location || "Not specified"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--text-muted)] [font-variant-numeric:tabular-nums]">
                  {formatSalary(job.salaryMin, job.salaryMax)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-subtle)]">
                  {formatRelativeDate(job.postedDate)}
                </td>
                <td className="px-4 py-3 text-right">
                  <StatusBadge
                    tone={job.matchedCandidatesCount > 0 ? "info" : "neutral"}
                    size="sm"
                    className="font-medium"
                  >
                    {job.matchedCandidatesCount} matched
                  </StatusBadge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
