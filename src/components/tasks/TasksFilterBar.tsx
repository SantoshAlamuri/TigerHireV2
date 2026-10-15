"use client";

import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import type {
  ActionableTaskCategory,
  ActionableTaskPhase,
} from "@/lib/tasks/actionable-task-types";
import {
  TASK_ACTION_SHAPE_LABEL,
  TASK_CATEGORY_LABEL,
  TASK_PHASE_LABEL,
  type TaskActionShape,
} from "@/lib/tasks/task-display";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type TasksShapeFilter = TaskActionShape | "all";
export type TasksCategoryFilter = ActionableTaskCategory | "all";
export type TasksPhaseFilter = ActionableTaskPhase | "all";

type JobOption = { id: string; title: string };

type TasksFilterBarProps = {
  totalCount: number;
  decideCount: number;
  actCount: number;
  shapeFilter: TasksShapeFilter;
  onShapeChange: (shape: TasksShapeFilter) => void;
  phaseFilter: TasksPhaseFilter;
  onPhaseChange: (phase: TasksPhaseFilter) => void;
  categoryFilter: TasksCategoryFilter;
  onCategoryChange: (category: TasksCategoryFilter) => void;
  categories: ActionableTaskCategory[];
  categoryCounts: Partial<Record<ActionableTaskCategory, number>>;
  phaseCounts: Record<ActionableTaskPhase, number>;
  jobIdFilter: string | null;
  jobOptions: JobOption[];
  jobsLoading: boolean;
  onJobChange: (jobId: string | null) => void;
  onClearFilters: () => void;
};

const selectClassName =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";

export function TasksFilterBar({
  totalCount,
  decideCount,
  actCount,
  shapeFilter,
  onShapeChange,
  phaseFilter,
  onPhaseChange,
  categoryFilter,
  onCategoryChange,
  categories,
  categoryCounts,
  phaseCounts,
  jobIdFilter,
  jobOptions,
  jobsLoading,
  onJobChange,
  onClearFilters,
}: TasksFilterBarProps) {
  const hasSecondaryFilters =
    phaseFilter !== "all" || categoryFilter !== "all" || Boolean(jobIdFilter);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filter by action type"
          className="inline-flex w-full max-w-md rounded-lg bg-black/30 p-1 sm:w-auto"
        >
          <ShapeTab
            active={shapeFilter === "all"}
            onClick={() => onShapeChange("all")}
            label="All"
            count={totalCount}
          />
          <ShapeTab
            active={shapeFilter === "decide"}
            onClick={() => onShapeChange("decide")}
            label={TASK_ACTION_SHAPE_LABEL.decide}
            count={decideCount}
          />
          <ShapeTab
            active={shapeFilter === "act"}
            onClick={() => onShapeChange("act")}
            label={TASK_ACTION_SHAPE_LABEL.act}
            count={actCount}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <label className="sr-only" htmlFor="tasks-job-filter">
            Filter tasks by job
          </label>
          <select
            id="tasks-job-filter"
            value={jobIdFilter ?? ""}
            onChange={(e) => onJobChange(e.target.value || null)}
            disabled={jobsLoading}
            className={`${selectClassName} min-w-[10rem] max-w-[min(100%,16rem)] flex-1 sm:flex-none`}
          >
            <option value="">All jobs</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>

          {totalCount > 0 ? (
            <>
              <label className="sr-only" htmlFor="tasks-phase-filter">
                Filter tasks by phase
              </label>
              <select
                id="tasks-phase-filter"
                value={phaseFilter === "all" ? "" : String(phaseFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  onPhaseChange(v === "" ? "all" : (Number(v) as ActionableTaskPhase));
                }}
                className={selectClassName}
              >
                <option value="">All phases ({totalCount})</option>
                {([1, 2, 3] as const).map((phase) => (
                  <option key={phase} value={phase}>
                    {TASK_PHASE_LABEL[phase]} ({phaseCounts[phase]})
                  </option>
                ))}
              </select>

              {categories.length > 0 ? (
                <>
                  <label className="sr-only" htmlFor="tasks-category-filter">
                    Filter tasks by category
                  </label>
                  <select
                    id="tasks-category-filter"
                    value={categoryFilter === "all" ? "" : categoryFilter}
                    onChange={(e) => {
                      const v = e.target.value;
                      onCategoryChange(v === "" ? "all" : (v as ActionableTaskCategory));
                    }}
                    className={selectClassName}
                  >
                    <option value="">All types</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {TASK_CATEGORY_LABEL[c]} ({categoryCounts[c] ?? 0})
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </>
          ) : null}

          {hasSecondaryFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {jobIdFilter ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)]/60 pt-3 text-sm">
          <StatusBadge tone="info" size="sm">
            One role
          </StatusBadge>
          <Link
            href="/tasks"
            className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            All tasks
          </Link>
          <Link
            href={`/recruit/jobs/${jobIdFilter}`}
            className="text-xs text-white/50 underline-offset-2 hover:text-white/75 hover:underline"
          >
            Open plan
          </Link>
        </div>
      ) : null}

      {hasSecondaryFilters && totalCount > 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-white/45">
          <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden />
          Narrowing {totalCount} task{totalCount === 1 ? "" : "s"}
          {phaseFilter !== "all" ? ` · ${TASK_PHASE_LABEL[phaseFilter]}` : ""}
          {categoryFilter !== "all" ? ` · ${TASK_CATEGORY_LABEL[categoryFilter]}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function ShapeTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-none sm:px-4 sm:text-sm ${
        active
          ? "bg-[var(--accent)] text-black shadow-sm"
          : "text-white/65 hover:bg-white/[0.06] hover:text-white/90"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={active ? "text-black/70" : "text-white/45"}> ({count})</span>
    </button>
  );
}
