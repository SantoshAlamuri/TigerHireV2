import type { OrgPendingTask } from "./org-pending-tasks";
import type {
  ActionableTask,
  ActionableTaskAction,
  ActionableTaskPhase,
} from "./actionable-task-types";
import { taskActionShape, taskTypeLabel } from "./task-display";
import { resolveOperationalTaskHref } from "./tasks-page-href";

function categoryForKind(kind: OrgPendingTask["kind"]): ActionableTask["category"] {
  switch (kind) {
    case "approval":
      return "approvals";
    case "feedback":
      return "pipeline";
    case "slot_picker":
      return "scheduling";
    case "interviewer_assignment":
    case "interviewer_availability":
      return "setup";
    case "plan_exception":
      return "plan";
    default:
      return "pipeline";
  }
}

function phaseForKind(kind: OrgPendingTask["kind"]): ActionableTaskPhase {
  switch (kind) {
    case "slot_picker":
    case "feedback":
    case "interviewer_assignment":
    case "interviewer_availability":
    case "plan_exception":
      return 2;
    default:
      return 2;
  }
}

function actionForKind(kind: OrgPendingTask["kind"]): ActionableTaskAction {
  switch (kind) {
    case "feedback":
      return "submit_feedback";
    case "interviewer_assignment":
    case "interviewer_availability":
      return "configure";
    default:
      return "view";
  }
}

function legacyHrefForOperational(task: OrgPendingTask): string {
  switch (task.kind) {
    case "feedback":
      return `/recruit/jobs/${task.jobId}/feedback`;
    case "slot_picker":
    case "interviewer_assignment":
    case "interviewer_availability":
      return `/recruit/jobs/${task.jobId}/interviews`;
    case "plan_exception":
      return `/recruit/pipeline?jobId=${encodeURIComponent(task.jobId)}`;
    default:
      return task.href;
  }
}

function subjectFromTitle(title: string): string {
  const dash = title.indexOf("—");
  if (dash >= 0) return title.slice(dash + 1).trim();
  return title;
}

/** Map legacy operational rows; caller must set assignee_id and filter to current user. */
export function mapOperationalToActionable(
  task: OrgPendingTask,
  assigneeId: string,
  assigneeRole?: string,
): ActionableTask {
  const kindMap: Record<OrgPendingTask["kind"], ActionableTask["kind"]> = {
    approval: "approval_shortlist",
    feedback: "feedback",
    slot_picker: "slot_picker",
    interviewer_assignment: "interviewer_assignment",
    interviewer_availability: "interviewer_availability",
    plan_exception: "plan_exception",
  };
  const kind = kindMap[task.kind];
  const subject = subjectFromTitle(task.title);
  const context = [task.jobTitle, task.pipelineStageName].filter(Boolean).join(" · ");

  return {
    id: task.id,
    kind,
    category: categoryForKind(task.kind),
    phase: phaseForKind(task.kind),
    action_shape: taskActionShape(kind),
    type_label: taskTypeLabel(kind),
    subject_label: subject,
    context_label: context || task.jobTitle,
    title: task.title,
    subtitle: task.description || undefined,
    comment_preview: task.description || undefined,
    job_id: task.jobId,
    job_title: task.jobTitle,
    candidate_id: task.candidateId,
    pipeline_stage_name: task.pipelineStageName,
    assignee_id: assigneeId,
    assignee_role: assigneeRole,
    href: resolveOperationalTaskHref({
      id: task.id,
      kind: task.kind,
      jobId: task.jobId,
      legacyHref: legacyHrefForOperational(task),
    }),
    action: actionForKind(task.kind),
    action_label: task.kind === "feedback" ? "Submit" : "Open",
    created_at: task.createdAt ?? new Date().toISOString(),
    urgency: task.urgency ?? "normal",
    completable: task.kind === "feedback",
  };
}
