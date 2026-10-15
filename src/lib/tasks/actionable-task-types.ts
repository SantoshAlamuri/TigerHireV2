import type { PlanPendingTaskUrgency } from "./plan-pending-types";
import type { TaskActionShape } from "./task-display";

export type ActionableTaskKind =
  | "approval_shortlist"
  | "approval_requisition"
  | "approval_offer_finance"
  | "feedback"
  | "slot_picker"
  | "interviewer_assignment"
  | "interviewer_availability"
  | "plan_exception";

export type ActionableTaskCategory = "approvals" | "pipeline" | "scheduling" | "setup" | "plan";

export type ActionableTaskPhase = 1 | 2 | 3;

export type ActionableTaskAction = "approve" | "reject" | "submit_feedback" | "configure" | "view";

export type ActionableTask = {
  id: string;
  kind: ActionableTaskKind;
  category: ActionableTaskCategory;
  phase: ActionableTaskPhase;
  title: string;
  subtitle?: string;
  /** decide = approve/reject; act = open and complete elsewhere */
  action_shape?: TaskActionShape;
  /** e.g. Requisition, Shortlist, Feedback */
  type_label?: string;
  /** Primary subject — candidate name, req title, etc. */
  subject_label?: string;
  /** Where it lives — job · stage · department */
  context_label?: string;
  /** Who raised or owns the request (display name) */
  requested_by_name?: string;
  /** Latest note / prior-stage comment preview */
  comment_preview?: string;
  /** Days in current stage (plan exception / dwell tasks). */
  dwell_days?: number | null;
  /** Primary button label on inbox row */
  action_label?: string;
  job_id?: string;
  job_title?: string;
  candidate_id?: string;
  pipeline_stage_name?: string;
  assignee_id: string;
  assignee_role?: string;
  href: string;
  action: ActionableTaskAction;
  created_at: string;
  urgency: PlanPendingTaskUrgency;
  completable: boolean;
  request_id?: string;
  offer_id?: string;
  pipeline_candidate_id?: string;
  requested_by_id?: string;
};

export type ActionableTasksMeta = {
  total: number;
  by_kind: Record<string, number>;
  by_category: Record<string, number>;
  by_action_shape: Record<string, number>;
  flags_active: boolean;
};

const URGENCY_RANK: Record<PlanPendingTaskUrgency, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  normal: 3,
};

export function sortActionableTasks(tasks: ActionableTask[]): ActionableTask[] {
  return [...tasks].sort((a, b) => {
    const rank = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rank !== 0) return rank;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function buildActionableTasksMeta(
  tasks: ActionableTask[],
  flagsActive: boolean,
): ActionableTasksMeta {
  const by_kind: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  const by_action_shape: Record<string, number> = {};
  for (const t of tasks) {
    by_kind[t.kind] = (by_kind[t.kind] ?? 0) + 1;
    by_category[t.category] = (by_category[t.category] ?? 0) + 1;
    const shape = t.action_shape ?? "act";
    by_action_shape[shape] = (by_action_shape[shape] ?? 0) + 1;
  }
  return { total: tasks.length, by_kind, by_category, by_action_shape, flags_active: flagsActive };
}
