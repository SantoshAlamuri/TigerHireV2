import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthContext } from "@/lib/api-helpers";
import { hasRole } from "@/lib/api-helpers";
import { listPendingApprovalItems } from "@/lib/approvals/list-pending-approval-items";
import { isPlanAutoExecuteEnabled } from "@/lib/recruitment-plan/plan-auto-execute-flags";
import { listOrgPendingTasks } from "./org-pending-tasks";
import { mapApprovalItemsToActionable } from "./map-approval-items-to-actionable";
import { mapOperationalToActionable } from "./map-operational-to-actionable";
import { resolveProfileNames } from "./resolve-profile-names";
import {
  buildActionableTasksMeta,
  sortActionableTasks,
  type ActionableTask,
} from "./actionable-task-types";
import { enrichActionableTasksDisplay } from "./task-display";

export type ListActionableTasksParams = {
  organisationId: string;
  userId: string;
  role: string;
  jobId?: string;
};

function canSeeOperationalTask(
  ctx: AuthContext,
  taskKind: string,
  jobHiringManagerId: string | null | undefined,
): boolean {
  if (hasRole(ctx, "super_admin", "leadership")) return true;
  if (hasRole(ctx, "recruiter", "agency")) return true;
  if (hasRole(ctx, "hiring_manager") && jobHiringManagerId === ctx.userId) return true;
  if (taskKind === "feedback") return true;
  return false;
}

/**
 * Unified assignee-scoped task feed — single north-star read model for /tasks.
 */
export async function listActionableTasksForUser(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  ctx: AuthContext,
  params: ListActionableTasksParams,
): Promise<{ tasks: ActionableTask[]; meta: ReturnType<typeof buildActionableTasksMeta> }> {
  const { items: approvalItems } = await listPendingApprovalItems(supabase, admin, ctx);

  const profileIds: string[] = [];
  for (const item of approvalItems) {
    if (item.source === "hiring_request" && item.payload.createdById) {
      profileIds.push(item.payload.createdById);
    }
    if (item.source === "offer_finance" && item.payload.createdById) {
      profileIds.push(item.payload.createdById);
    }
  }
  const profileNames = await resolveProfileNames(admin, profileIds);

  let tasks = mapApprovalItemsToActionable(approvalItems, ctx, profileNames);

  const operational = await listOrgPendingTasks(supabase, admin, {
    organisationId: params.organisationId,
    userId: params.userId,
    role: params.role,
    jobId: params.jobId,
    skipApprovals: true,
  });

  const jobHmCache = new Map<string, string | null>();
  for (const op of operational) {
    if (!jobHmCache.has(op.jobId)) {
      const { data: job } = await supabase
        .from("jobs")
        .select("hiring_manager_id")
        .eq("id", op.jobId)
        .maybeSingle();
      jobHmCache.set(op.jobId, (job?.hiring_manager_id as string | null) ?? null);
    }
    const hmId = jobHmCache.get(op.jobId);

    if (op.kind === "feedback") {
      const { data: pc } = await admin
        .from("pipeline_candidates")
        .select("pipeline_stages(interviewer_user_id)")
        .eq("id", op.id.replace(/^fb:/, ""))
        .maybeSingle();
      const stage = pc?.pipeline_stages as { interviewer_user_id?: string | null } | null;
      const interviewerId = stage?.interviewer_user_id;
      if (interviewerId && interviewerId !== ctx.userId) continue;
      if (!interviewerId && !canSeeOperationalTask(ctx, op.kind, hmId)) continue;
    } else if (!canSeeOperationalTask(ctx, op.kind, hmId)) {
      continue;
    }

    tasks.push(mapOperationalToActionable(op, ctx.userId, ctx.role));
  }

  if (params.jobId) {
    tasks = tasks.filter((t) => t.job_id === params.jobId);
  }

  tasks = enrichActionableTasksDisplay(sortActionableTasks(tasks));
  const meta = buildActionableTasksMeta(tasks, isPlanAutoExecuteEnabled());

  return { tasks, meta };
}
