import type { SupabaseClient } from "@supabase/supabase-js";
import { canActorApproveRequiredRole } from "@/lib/approvals/actor-resolution";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { hasRole } from "@/lib/api-helpers";
import type { AuthContext } from "@/lib/api-helpers";
import { ACTIONABLE_REQUISITION_STAGE_STATUSES } from "@/lib/workflows/requisition-approval-workflow";
import { parseOfferCtcValue } from "@/lib/offers/compensation-normalize";
import type {
  ApprovalTaskItem,
  PendingOfferFinanceApproval,
  PendingRequisitionApproval,
  PendingShortlistApproval,
} from "./task-types";

function isMissingDelegationsTableError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("approval_delegations") ||
    message.includes("schema cache")
  );
}

export type PendingApprovalItemsResult = {
  shortlistApprovals: PendingShortlistApproval[];
  items: ApprovalTaskItem[];
};

/**
 * User-scoped approval inbox (shortlist, requisition workflow, offer/finance).
 * Shared by GET /api/approvals and unified actionable tasks.
 */
export async function listPendingApprovalItems(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  ctx: AuthContext,
): Promise<PendingApprovalItemsResult> {
  const myRole: "recruiter" | "hiring_manager" = hasRole(ctx, "hiring_manager")
    ? "hiring_manager"
    : "recruiter";

  let jobFilter: { column: string; value: unknown };
  if (myRole === "hiring_manager") {
    jobFilter = { column: "hiring_manager_id", value: ctx.userId };
  } else {
    jobFilter = { column: "organisation_id", value: ctx.organisationId };
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, hiring_manager_id")
    .eq(jobFilter.column, jobFilter.value)
    .eq("status", "open");

  const shortlistApprovals: PendingShortlistApproval[] = [];
  if (jobs && jobs.length > 0) {
    const jobIds = jobs.map((j: Record<string, unknown>) => j.id as string);
    const jobMap = new Map(jobs.map((j: Record<string, unknown>) => [j.id as string, j]));

    const { data: pipelineCandidates } = await supabase
      .from("pipeline_candidates")
      .select(
        "id, job_id, candidate_id, status, stage_id, created_at, candidates(id, name, email, skills, location)",
      )
      .in("job_id", jobIds)
      .in("status", ["shortlisted"]);

    if (pipelineCandidates && pipelineCandidates.length > 0) {
      const pcIds = pipelineCandidates.map((pc: Record<string, unknown>) => pc.id as string);
      const { data: existingApprovals } = await admin
        .from("shortlist_approvals")
        .select("pipeline_candidate_id, approver_role, decision, decided_at, notes")
        .in("pipeline_candidate_id", pcIds);

      const approvalMap = new Map<string, Record<string, unknown>[]>();
      for (const a of existingApprovals ?? []) {
        const pcId = a.pipeline_candidate_id as string;
        if (!approvalMap.has(pcId)) approvalMap.set(pcId, []);
        approvalMap.get(pcId)!.push(a);
      }

      // FitScore per (job, candidate) so the approver can see the score they're
      // signing off on — the card previously showed only name + skills.
      const scoreMap = new Map<string, { score: number | null; band: string | null }>();
      const scoreJobIds = [...new Set(pipelineCandidates.map((pc) => pc.job_id as string))];
      const scoreCandidateIds = [
        ...new Set(pipelineCandidates.map((pc) => pc.candidate_id as string)),
      ];
      if (scoreJobIds.length > 0 && scoreCandidateIds.length > 0) {
        const { data: fitRows } = await supabase
          .from("fit_scores")
          .select("job_id, candidate_id, overall_score, band")
          .in("job_id", scoreJobIds)
          .in("candidate_id", scoreCandidateIds)
          .or("is_test_run.eq.false,is_test_run.is.null");
        for (const r of fitRows ?? []) {
          scoreMap.set(`${r.job_id}:${r.candidate_id}`, {
            score: (r.overall_score as number | null) ?? null,
            band: (r.band as string | null) ?? null,
          });
        }
      }

      const pending = pipelineCandidates.filter((pc: Record<string, unknown>) => {
        const approvals = approvalMap.get(pc.id as string) ?? [];
        return !approvals.some((a: Record<string, unknown>) => a.approver_role === myRole);
      });

      shortlistApprovals.push(
        ...pending.map((pc: Record<string, unknown>) => {
          const job = jobMap.get(pc.job_id as string);
          const approvals = approvalMap.get(pc.id as string) ?? [];
          const priorNote = approvals
            .map((a: Record<string, unknown>) => (a.notes as string | null)?.trim())
            .find((n) => n && n.length > 0);
          return {
            id: pc.id as string,
            job_id: pc.job_id as string,
            candidate_id: pc.candidate_id as string,
            status: pc.status as string,
            stage_id: (pc.stage_id as string | null | undefined) ?? null,
            created_at: String(pc.created_at ?? new Date().toISOString()),
            candidates: (pc.candidates as PendingShortlistApproval["candidates"]) ?? null,
            jobTitle: String((job as Record<string, unknown> | undefined)?.title ?? "Unknown"),
            fitScore: scoreMap.get(`${pc.job_id}:${pc.candidate_id}`)?.score ?? null,
            fitBand: scoreMap.get(`${pc.job_id}:${pc.candidate_id}`)?.band ?? null,
            approvals: approvals as PendingShortlistApproval["approvals"],
            commentPreview: priorNote ?? null,
          } satisfies PendingShortlistApproval;
        }),
      );
    }
  }

  const delegatedRoles = new Set<string>();
  if (ctx.organisationId) {
    const nowIso = new Date().toISOString();
    const { data: delegations, error: delegationErr } = await admin
      .from("approval_delegations")
      .select("approver_role")
      .eq("organisation_id", ctx.organisationId)
      .eq("delegate_profile_id", ctx.userId)
      .is("revoked_at", null)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso);
    if (delegationErr && !isMissingDelegationsTableError(delegationErr)) {
      throw delegationErr;
    }
    for (const d of delegations ?? []) {
      const role = String((d as { approver_role?: string }).approver_role ?? "").trim();
      if (role) delegatedRoles.add(role);
    }
  }

  const rolePool = new Set<string>([ctx.role, ...delegatedRoles]);
  const { data: activeInstances, error: activeInstancesErr } = await admin
    .from("workflow_instances")
    .select("id, subject_id, organisation_id")
    .eq("subject_type", "hiring_request")
    .eq("status", "active")
    .eq("organisation_id", ctx.organisationId);
  if (activeInstancesErr) throw activeInstancesErr;

  const pendingRequisitionApprovals: PendingRequisitionApproval[] = [];
  if (activeInstances && activeInstances.length > 0) {
    const instanceIds = activeInstances.map((i) => i.id as string);
    const subjectByInstance = new Map(
      activeInstances.map((i) => [i.id as string, i.subject_id as string]),
    );
    const { data: activeStages, error: stageErr } = await admin
      .from("workflow_stages")
      .select("id, instance_id, stage_key, approver_role, sla_due_at, created_at")
      .in("instance_id", instanceIds)
      .in("status", [...ACTIONABLE_REQUISITION_STAGE_STATUSES]);
    if (stageErr) throw stageErr;

    const actionableStages: typeof activeStages = [];
    for (const stage of activeStages ?? []) {
      if (ctx.role === "super_admin") {
        actionableStages.push(stage);
        continue;
      }
      if (!ctx.organisationId) continue;
      const mayDecide = await canActorApproveRequiredRole(admin, {
        organisationId: ctx.organisationId,
        actorProfileId: ctx.userId,
        requiredRole: (stage.approver_role as string | null) ?? null,
      });
      if (mayDecide) actionableStages.push(stage);
    }

    const requestIds = [
      ...new Set(actionableStages.map((s) => subjectByInstance.get(s.instance_id as string))),
    ].filter((v): v is string => Boolean(v));
    const requestMap = new Map<string, Record<string, unknown>>();
    const commentByInstance = new Map<string, string>();
    if (requestIds.length > 0) {
      const { data: requests, error: reqErr } = await supabase
        .from("hiring_requests")
        .select(
          "id, title, req_code, department, urgency, status, created_at, created_by, headcount, budget_ctc_min, budget_ctc_max",
        )
        .in("id", requestIds);
      if (reqErr) throw reqErr;
      for (const request of requests ?? []) {
        requestMap.set(request.id as string, request as Record<string, unknown>);
      }

      const instanceIdsForComments = [
        ...new Set(actionableStages.map((s) => s.instance_id as string)),
      ];
      if (instanceIdsForComments.length > 0) {
        const { data: priorStages } = await admin
          .from("workflow_stages")
          .select("instance_id, comments, stage_order, status")
          .in("instance_id", instanceIdsForComments)
          .not("comments", "is", null)
          .order("stage_order", { ascending: false });
        for (const ps of priorStages ?? []) {
          const iid = ps.instance_id as string;
          if (commentByInstance.has(iid)) continue;
          const c = (ps.comments as string | null)?.trim();
          if (c) commentByInstance.set(iid, c);
        }
      }
    }

    for (const stage of actionableStages) {
      const requestId = subjectByInstance.get(stage.instance_id as string);
      if (!requestId) continue;
      const request = requestMap.get(requestId);
      if (!request) continue;
      const instanceId = stage.instance_id as string;
      pendingRequisitionApprovals.push({
        id: String(stage.id),
        requestId,
        requestTitle: String(request.title ?? "Hiring request"),
        reqCode: (request.req_code as string | null) ?? null,
        department: (request.department as string | null) ?? null,
        urgency: (request.urgency as string | null) ?? null,
        status: (request.status as string | null) ?? null,
        headcount: (request.headcount as number | null) ?? null,
        budgetCtcMin: (request.budget_ctc_min as number | null) ?? null,
        budgetCtcMax: (request.budget_ctc_max as number | null) ?? null,
        stageKey: String(stage.stage_key ?? "stage"),
        approverRole: (stage.approver_role as string | null) ?? null,
        slaDueAt: (stage.sla_due_at as string | null) ?? null,
        createdAt: String(request.created_at ?? stage.created_at ?? new Date().toISOString()),
        createdById: (request.created_by as string | null) ?? null,
        commentPreview: commentByInstance.get(instanceId) ?? null,
      });
    }
  }

  const items: ApprovalTaskItem[] = [
    ...shortlistApprovals.map((p) => ({
      id: `shortlist:${String((p as Record<string, unknown>).id ?? "")}`,
      source: "candidate_shortlist" as const,
      createdAt: String((p as Record<string, unknown>).created_at ?? new Date().toISOString()),
      payload: p,
    })),
    ...pendingRequisitionApprovals.map((p) => ({
      id: `requisition:${p.id}`,
      source: "hiring_request" as const,
      createdAt: p.createdAt,
      payload: p,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const mayHandleFinance =
    rolePool.has("leadership") ||
    rolePool.has("finance") ||
    (await hasAnyEnterpriseRole(ctx.userId, ["leadership", "super_admin", "finance"], supabase));
  const pendingOfferFinanceApprovals: PendingOfferFinanceApproval[] = [];
  if (ctx.organisationId && mayHandleFinance) {
    const { data: offers, error: offerErr } = await admin
      .from("offers")
      .select(
        "id, role_title, status, created_at, created_by, notes, compensation_json, applications!inner(candidate_id, job_id, candidates(name), jobs(title))",
      )
      .eq("organisation_id", ctx.organisationId)
      .eq("status", "pending_admin")
      .order("created_at", { ascending: false });
    if (offerErr) throw offerErr;
    for (const offer of offers ?? []) {
      const application = offer.applications as {
        candidate_id?: string;
        job_id?: string;
        candidates?: { name?: string | null } | null;
        jobs?: { title?: string | null } | null;
      } | null;
      const notes = (offer.notes as string | null)?.trim();
      pendingOfferFinanceApprovals.push({
        id: String(offer.id),
        offerId: String(offer.id),
        roleTitle: String(offer.role_title ?? "Offer"),
        offerStatus: (offer.status as string | null) ?? null,
        jobTitle: application?.jobs?.title ?? null,
        candidateName: application?.candidates?.name ?? null,
        createdAt: String(offer.created_at ?? new Date().toISOString()),
        createdById: (offer.created_by as string | null) ?? null,
        commentPreview: notes && notes.length > 0 ? notes : null,
        jobId: application?.job_id ?? null,
        ctc: parseOfferCtcValue((offer.compensation_json as { ctc?: unknown } | null)?.ctc),
        currency:
          ((offer.compensation_json as { currency?: string | null } | null)?.currency as
            | string
            | null) ?? null,
      });
    }
  }

  const allItems: ApprovalTaskItem[] = [
    ...items,
    ...pendingOfferFinanceApprovals.map((p) => ({
      id: `offer_finance:${p.id}`,
      source: "offer_finance" as const,
      createdAt: p.createdAt,
      payload: p,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { shortlistApprovals, items: allItems };
}
