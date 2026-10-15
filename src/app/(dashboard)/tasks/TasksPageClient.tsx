"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListTodo } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { TaskActionDrawer } from "@/components/tasks/TaskActionDrawer";
import {
  TasksFilterBar,
  type TasksCategoryFilter,
  type TasksPhaseFilter,
  type TasksShapeFilter,
} from "@/components/tasks/TasksFilterBar";
import { TasksInboxTable } from "@/components/tasks/TasksInboxTable";
import { useApiQuery } from "@/lib/hooks/use-api";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import type {
  ActionableTask,
  ActionableTaskCategory,
  ActionableTaskPhase,
  ActionableTasksMeta,
} from "@/lib/tasks/actionable-task-types";

type TasksResponse = { tasks: ActionableTask[]; meta: ActionableTasksMeta };

type ShapeFilter = TasksShapeFilter;
type CategoryFilter = TasksCategoryFilter;
type PhaseFilter = TasksPhaseFilter;

type JobOption = { id: string; title: string };

function buildTasksUrl(params: {
  task?: string | null;
  jobId?: string | null;
  shape?: ShapeFilter;
  category?: CategoryFilter;
  phase?: PhaseFilter;
}): string {
  const sp = new URLSearchParams();
  if (params.jobId) sp.set("jobId", params.jobId);
  if (params.shape && params.shape !== "all") sp.set("shape", params.shape);
  if (params.category && params.category !== "all") sp.set("category", params.category);
  if (params.phase && params.phase !== "all") sp.set("phase", String(params.phase));
  if (params.task) sp.set("task", params.task);
  const qs = sp.toString();
  return qs ? `/tasks?${qs}` : "/tasks";
}

function parsePhaseParam(value: string | null): PhaseFilter {
  if (value === "1" || value === "2" || value === "3") return Number(value) as ActionableTaskPhase;
  return "all";
}

export function TasksPageClient() {
  const enabled = isPlanDocumentUiEnabled();
  const searchParams = useSearchParams();
  const router = useRouter();

  const focusTaskId = searchParams.get("task");
  const jobIdFilter = searchParams.get("jobId")?.trim() || null;
  const shapeParam = searchParams.get("shape") as ShapeFilter | null;
  const categoryParam = searchParams.get("category") as CategoryFilter | null;
  const phaseParam = searchParams.get("phase");

  const [shapeFilter, setShapeFilter] = useState<ShapeFilter>(
    shapeParam === "decide" || shapeParam === "act" ? shapeParam : "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(
    categoryParam && categoryParam !== "all" ? categoryParam : "all",
  );
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(parsePhaseParam(phaseParam));

  const apiPath = useMemo(() => {
    if (!enabled) return null;
    return jobIdFilter
      ? `/api/tasks/pending?jobId=${encodeURIComponent(jobIdFilter)}`
      : "/api/tasks/pending";
  }, [enabled, jobIdFilter]);

  const { data, loading, error, refetch } = useApiQuery<TasksResponse>(apiPath);
  const { data: jobsData, loading: jobsLoading } = useApiQuery<{ jobs: JobOption[] }>(
    enabled ? "/api/jobs?status=open&limit=100" : null,
  );

  const tasks = data?.tasks ?? [];
  const jobOptions = useMemo(() => {
    const rows = (jobsData?.jobs ?? []) as Array<{ id: string; title?: string | null }>;
    return rows
      .map((job) => ({ id: job.id, title: job.title?.trim() || "Untitled role" }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [jobsData?.jobs]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (shapeFilter !== "all" && t.action_shape !== shapeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (phaseFilter !== "all" && t.phase !== phaseFilter) return false;
      return true;
    });
  }, [tasks, shapeFilter, categoryFilter, phaseFilter]);

  const categories = useMemo(() => {
    const set = new Set<ActionableTaskCategory>();
    for (const t of tasks) set.add(t.category);
    return [...set];
  }, [tasks]);

  const phaseCounts = useMemo(() => {
    const counts: Record<ActionableTaskPhase, number> = { 1: 0, 2: 0, 3: 0 };
    for (const t of tasks) counts[t.phase] += 1;
    return counts;
  }, [tasks]);

  const focusedTask = useMemo(
    () => (focusTaskId ? (tasks.find((t) => t.id === focusTaskId) ?? null) : null),
    [tasks, focusTaskId],
  );

  const focusedTaskHiddenByFilters = Boolean(
    focusTaskId && focusedTask && !filtered.some((t) => t.id === focusTaskId),
  );
  const missingFocusedTask = Boolean(focusTaskId && !loading && !focusedTask);

  const pushFilters = useCallback(
    (next: {
      shape?: ShapeFilter;
      category?: CategoryFilter;
      phase?: PhaseFilter;
      jobId?: string | null;
      task?: string | null;
    }) => {
      router.replace(
        buildTasksUrl({
          jobId: next.jobId !== undefined ? next.jobId : jobIdFilter,
          shape: next.shape ?? shapeFilter,
          category: next.category ?? categoryFilter,
          phase: next.phase ?? phaseFilter,
          task: next.task !== undefined ? next.task : focusTaskId,
        }),
        { scroll: false },
      );
    },
    [router, jobIdFilter, shapeFilter, categoryFilter, phaseFilter, focusTaskId],
  );

  const closeDrawer = useCallback(() => {
    pushFilters({ task: null });
  }, [pushFilters]);

  const openTask = useCallback(
    (task: ActionableTask) => {
      pushFilters({ task: task.id });
    },
    [pushFilters],
  );

  const navigateToTask = useCallback(
    (task: ActionableTask) => {
      router.push(task.href);
    },
    [router],
  );

  const handleJobFilterChange = useCallback(
    (nextJobId: string | null) => {
      pushFilters({ jobId: nextJobId, task: null });
    },
    [pushFilters],
  );

  const clearFilters = useCallback(() => {
    setShapeFilter("all");
    setCategoryFilter("all");
    setPhaseFilter("all");
    pushFilters({ shape: "all", category: "all", phase: "all", jobId: null, task: null });
  }, [pushFilters, setShapeFilter, setCategoryFilter, setPhaseFilter]);

  useEffect(() => {
    setShapeFilter(shapeParam === "decide" || shapeParam === "act" ? shapeParam : "all");
  }, [shapeParam]);

  useEffect(() => {
    setCategoryFilter(categoryParam && categoryParam !== "all" ? categoryParam : "all");
  }, [categoryParam]);

  useEffect(() => {
    setPhaseFilter(parsePhaseParam(phaseParam));
  }, [phaseParam]);

  if (!enabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tasks" subtitle="Enable plan document mode to see pending actions." />
      </div>
    );
  }

  const decideCount = data?.meta.by_action_shape?.decide ?? 0;
  const actCount = data?.meta.by_action_shape?.act ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        subtitle="Decisions and follow-ups that need you — filter by job or hiring phase when the list grows."
      />

      <TasksFilterBar
        totalCount={tasks.length}
        decideCount={decideCount}
        actCount={actCount}
        shapeFilter={shapeFilter}
        onShapeChange={(shape) => {
          setShapeFilter(shape);
          pushFilters({ shape });
        }}
        phaseFilter={phaseFilter}
        onPhaseChange={(phase) => {
          setPhaseFilter(phase);
          pushFilters({ phase });
        }}
        categoryFilter={categoryFilter}
        onCategoryChange={(category) => {
          setCategoryFilter(category);
          pushFilters({ category });
        }}
        categories={categories}
        categoryCounts={data?.meta.by_category ?? {}}
        phaseCounts={phaseCounts}
        jobIdFilter={jobIdFilter}
        jobOptions={jobOptions}
        jobsLoading={jobsLoading}
        onJobChange={handleJobFilterChange}
        onClearFilters={clearFilters}
      />

      {missingFocusedTask ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          <p className="font-medium">This approval is no longer in your Tasks inbox.</p>
          <p className="mt-1 text-xs text-amber-100/70">
            It may already be decided, assigned to someone else, or filtered out. Check hiring
            requests or clear filters below.
          </p>
          <button
            type="button"
            onClick={() => pushFilters({ task: null })}
            className="mt-2 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {focusedTaskHiddenByFilters ? (
        <div className="rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-sm text-white/70">
          <p>
            The linked task is hidden by your current filters.{" "}
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Clear filters
            </button>{" "}
            to see it in the list — you can still decide in the panel.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs font-medium text-[var(--accent)] underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : filtered.length === 0 ? (
        <div className="card-lifted flex flex-col items-center gap-3 p-12 text-center">
          <ListTodo className="text-white/40" size={32} aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white/80">
              {tasks.length > 0 ? "No tasks match these filters" : "You're all caught up"}
            </p>
            <p className="text-sm text-white/55">
              {tasks.length > 0
                ? "Try a broader action type or clear filters."
                : "No pending decisions or follow-ups right now."}
            </p>
          </div>
          {tasks.length > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <TasksInboxTable tasks={filtered} onDecide={openTask} onOpen={navigateToTask} />
      )}

      <TaskActionDrawer
        task={focusedTask}
        onClose={closeDrawer}
        onCompleted={() => void refetch()}
      />
    </div>
  );
}
