import type { PendingTaskKind } from "./org-pending-tasks";

export type PlanPendingTaskUrgency = "overdue" | "due_today" | "upcoming" | "normal";

export type PlanPendingTaskDto = {
  id?: string;
  kind: PendingTaskKind;
  title: string;
  subtitle?: string;
  href: string;
  candidate_id?: string;
  pipeline_stage_name?: string;
  created_at: string;
  urgency: PlanPendingTaskUrgency;
};

export type PlanPendingTasksResponse = {
  tasks: PlanPendingTaskDto[];
  meta: {
    total: number;
    by_kind: Record<string, number>;
    flags_active: boolean;
  };
};

const URGENCY_RANK: Record<PlanPendingTaskUrgency, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  normal: 3,
};

export function sortPlanPendingTasks(tasks: PlanPendingTaskDto[]): PlanPendingTaskDto[] {
  return [...tasks].sort((a, b) => {
    const rank = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rank !== 0) return rank;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function buildPlanPendingMeta(tasks: PlanPendingTaskDto[], flagsActive: boolean) {
  const by_kind: Record<string, number> = {};
  for (const t of tasks) {
    by_kind[t.kind] = (by_kind[t.kind] ?? 0) + 1;
  }
  return {
    total: tasks.length,
    by_kind,
    flags_active: flagsActive,
  };
}
