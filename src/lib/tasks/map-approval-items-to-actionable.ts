import type { ApprovalTaskItem } from "@/lib/approvals/task-types";
import type { AuthContext } from "@/lib/api-helpers";
import { hasRole } from "@/lib/api-helpers";
import type { ActionableTask } from "./actionable-task-types";
import type { PlanPendingTaskUrgency } from "./plan-pending-types";
import { taskActionShape, taskTypeLabel } from "./task-display";
import { buildTasksPageHref } from "./tasks-page-href";

function urgencyFromIso(iso: string, slaIso?: string | null): PlanPendingTaskUrgency {
  const ref = slaIso ? new Date(slaIso) : new Date(iso);
  const hours = (Date.now() - ref.getTime()) / 3600000;
  if (hours >= 48) return "overdue";
  if (hours >= 24) return "due_today";
  if (hours >= 4) return "upcoming";
  return "normal";
}

function formatApproverRole(role: string | null | undefined): string {
  if (!role) return "Approver";
  return role.replace(/_/g, " ");
}

export function mapApprovalItemsToActionable(
  items: ApprovalTaskItem[],
  ctx: AuthContext,
  profileNames?: Map<string, string>,
): ActionableTask[] {
  const tasks: ActionableTask[] = [];
  const assigneeId = ctx.userId;
  const assigneeRole = ctx.role;
  const nameOf = (id: string | null | undefined) => (id ? (profileNames?.get(id) ?? null) : null);

  for (const item of items) {
    if (item.source === "candidate_shortlist") {
      const p = item.payload;
      const name = p.candidates?.name ?? "Candidate";
      const myApproverRole = hasRole(ctx, "hiring_manager") ? "hiring_manager" : "recruiter";
      tasks.push({
        id: item.id,
        kind: "approval_shortlist",
        category: "approvals",
        phase: 2,
        action_shape: "decide",
        type_label: taskTypeLabel("approval_shortlist"),
        subject_label: name,
        context_label: p.jobTitle,
        title: `Shortlist — ${name}`,
        subtitle: `Role: ${p.jobTitle}`,
        comment_preview: p.commentPreview ?? undefined,
        job_id: p.job_id,
        job_title: p.jobTitle,
        candidate_id: p.candidate_id,
        pipeline_candidate_id: p.id,
        assignee_id: assigneeId,
        assignee_role: myApproverRole,
        href: buildTasksPageHref({ taskId: item.id, jobId: p.job_id }),
        action: "approve",
        action_label: "Decide",
        created_at: item.createdAt,
        urgency: urgencyFromIso(item.createdAt),
        completable: true,
      });
    } else if (item.source === "hiring_request") {
      const p = item.payload;
      const requestedByName = nameOf(p.createdById);
      const contextParts = [p.reqCode, p.department, formatApproverRole(p.approverRole)].filter(
        Boolean,
      );
      tasks.push({
        id: item.id,
        kind: "approval_requisition",
        category: "approvals",
        phase: 1,
        action_shape: "decide",
        type_label: taskTypeLabel("approval_requisition"),
        subject_label: p.requestTitle,
        context_label: contextParts.join(" · ") || "Requisition",
        title: `Requisition — ${p.requestTitle}`,
        subtitle: contextParts.join(" · ") || undefined,
        comment_preview: p.commentPreview ?? undefined,
        requested_by_name: requestedByName ?? undefined,
        requested_by_id: p.createdById ?? undefined,
        request_id: p.requestId,
        assignee_id: assigneeId,
        assignee_role: p.approverRole ?? assigneeRole,
        href: buildTasksPageHref({ taskId: item.id }),
        action: "approve",
        action_label: "Decide",
        created_at: item.createdAt,
        urgency: urgencyFromIso(item.createdAt, p.slaDueAt),
        completable: true,
      });
    } else if (item.source === "offer_finance") {
      const p = item.payload;
      const subject = p.candidateName ?? p.roleTitle;
      const context = [p.jobTitle, p.roleTitle].filter(Boolean).join(" · ");
      tasks.push({
        id: item.id,
        kind: "approval_offer_finance",
        category: "approvals",
        phase: 3,
        action_shape: "decide",
        type_label: taskTypeLabel("approval_offer_finance"),
        subject_label: subject,
        context_label: context || "Offer",
        title: `Offer — ${subject}`,
        subtitle: context || undefined,
        comment_preview: p.commentPreview ?? undefined,
        requested_by_name: nameOf(p.createdById) ?? undefined,
        requested_by_id: p.createdById ?? undefined,
        job_id: p.jobId ?? undefined,
        job_title: p.jobTitle ?? undefined,
        offer_id: p.offerId,
        assignee_id: assigneeId,
        assignee_role: "finance",
        href: buildTasksPageHref({ taskId: item.id, jobId: p.jobId ?? undefined }),
        action: "approve",
        action_label: "Decide",
        created_at: item.createdAt,
        urgency: urgencyFromIso(item.createdAt),
        completable: true,
      });
    }
  }

  return tasks;
}

export function actionableKindToLegacyPendingKind(kind: ActionableTask["kind"]): string {
  switch (kind) {
    case "approval_shortlist":
      return "approval";
    default:
      return kind.replace("approval_", "");
  }
}
