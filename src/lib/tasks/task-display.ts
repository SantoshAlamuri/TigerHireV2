import type {
  ActionableTask,
  ActionableTaskAction,
  ActionableTaskCategory,
  ActionableTaskKind,
  ActionableTaskPhase,
} from "./actionable-task-types";

/** User-facing action shape: binary decision vs operational work. */
export type TaskActionShape = "decide" | "act";

export const TASK_ACTION_SHAPE_LABEL: Record<TaskActionShape, string> = {
  decide: "Needs decision",
  act: "Needs action",
};

export const TASK_CATEGORY_LABEL: Record<ActionableTaskCategory, string> = {
  approvals: "Decision",
  pipeline: "Pipeline",
  scheduling: "Scheduling",
  setup: "Setup",
  plan: "Plan",
};

export const TASK_PHASE_LABEL: Record<ActionableTaskPhase, string> = {
  1: "Launch",
  2: "Pipeline",
  3: "Hire",
};

export const TASK_ROW_ACTION_LABEL: Record<TaskActionShape, string> = {
  decide: "Decide",
  act: "Open",
};

const KIND_TYPE_LABEL: Record<ActionableTaskKind, string> = {
  approval_shortlist: "Shortlist",
  approval_requisition: "Requisition",
  approval_offer_finance: "Offer",
  feedback: "Feedback",
  slot_picker: "Scheduling",
  interviewer_assignment: "Interviewer",
  interviewer_availability: "Availability",
  plan_exception: "Plan alert",
};

const KIND_ACTION_SHAPE: Record<ActionableTaskKind, TaskActionShape> = {
  approval_shortlist: "decide",
  approval_requisition: "decide",
  approval_offer_finance: "decide",
  feedback: "act",
  slot_picker: "act",
  interviewer_assignment: "act",
  interviewer_availability: "act",
  plan_exception: "act",
};

const ACTION_BUTTON_LABEL: Record<ActionableTaskAction, string> = {
  approve: "Review",
  reject: "Review",
  submit_feedback: "Submit",
  configure: "Open",
  view: "Open",
};

export function taskActionShape(kind: ActionableTaskKind): TaskActionShape {
  return KIND_ACTION_SHAPE[kind];
}

export function taskTypeLabel(kind: ActionableTaskKind): string {
  return KIND_TYPE_LABEL[kind];
}

export function taskActionButtonLabel(task: ActionableTask): string {
  if (task.action_label) return task.action_label;
  if (task.kind.startsWith("approval_")) return "Decide";
  return ACTION_BUTTON_LABEL[task.action];
}

function resolveSubjectLabel(task: ActionableTask): string {
  if (task.subject_label) return task.subject_label;
  const subjectFromTitle = task.title.replace(/^[^—]+—\s*/, "").trim();
  if (subjectFromTitle.length > 0) return subjectFromTitle;
  return task.title;
}

function resolveContextLabel(task: ActionableTask): string | undefined {
  if (task.context_label) return task.context_label;
  const parts: string[] = [];
  if (task.job_title) parts.push(task.job_title);
  if (task.pipeline_stage_name) parts.push(task.pipeline_stage_name);
  if (task.subtitle) parts.push(task.subtitle);
  if (parts.length === 0) return undefined;
  return parts.join(" · ");
}

export function enrichActionableTaskDisplay(task: ActionableTask): ActionableTask {
  const action_shape = task.action_shape ? task.action_shape : taskActionShape(task.kind);
  const type_label = task.type_label ? task.type_label : taskTypeLabel(task.kind);
  const subject_label = resolveSubjectLabel(task);
  const context_label = resolveContextLabel(task);
  const partial = { ...task, action_shape, type_label, subject_label, context_label };
  const action_label = task.action_label ? task.action_label : taskActionButtonLabel(partial);

  return { ...partial, action_label };
}

export function enrichActionableTasksDisplay(tasks: ActionableTask[]): ActionableTask[] {
  return tasks.map(enrichActionableTaskDisplay);
}
