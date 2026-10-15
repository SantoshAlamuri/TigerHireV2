import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
} from "@/lib/api-helpers";
import { createNotification } from "@/lib/services/notifications";
import { triggerSchedulerAgent } from "@/lib/agents/scheduler";
import { getDualApprovalStatus } from "@/lib/pipeline-approvals";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { z } from "zod";

const approvePipelineCandidateBodySchema = z
  .object({
    candidateId: z.string().trim().min(1).optional(),
    decision: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();

/**
 * POST /api/jobs/[id]/pipeline/approve
 * Body: { candidateId: string, decision: "approved" | "rejected", notes?: string }
 *
 * Records an approval from the current user's role.
 * If both recruiter and HM have approved, triggers interview scheduling.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  if (!hasRole(ctx, "recruiter", "leadership", "hiring_manager", "agency", "super_admin")) {
    return jsonError("Forbidden", 403);
  }

  const { id: jobId } = await params;
  const parsed = await parseJsonBody<{ candidateId?: string; decision?: string; notes?: string }>(
    request,
    "POST /api/jobs/[id]/pipeline/approve",
  );
  if (parsed.errorResponse) return parsed.errorResponse;
  const bodyParsed = approvePipelineCandidateBodySchema.safeParse(parsed.body);
  if (!bodyParsed.success) return jsonError("Invalid request body", 422);
  const body = bodyParsed.data;

  const { candidateId, decision, notes } = body;
  if (!candidateId || typeof candidateId !== "string")
    return jsonError("candidateId is required", 400);
  if (!decision || !["approved", "rejected"].includes(decision)) {
    return jsonError("decision must be 'approved' or 'rejected'", 400);
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const { assertJobAccess } = await import("@/lib/job-access");
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const { data: jobRow } = await supabase.from("jobs").select("title").eq("id", jobId).single();
  const jobTitle = jobRow?.title ?? null;

  const approverRole: "recruiter" | "hiring_manager" = hasRole(ctx, "hiring_manager")
    ? "hiring_manager"
    : "recruiter";

  const { data: pipelineCandidate, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("id, status, stage_id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .single();

  if (pcErr || !pipelineCandidate) {
    return jsonError("Candidate not in pipeline for this job", 404);
  }

  const { data: existingApproval } = await admin
    .from("shortlist_approvals")
    .select("id")
    .eq("pipeline_candidate_id", pipelineCandidate.id)
    .eq("approver_role", approverRole)
    .single();

  if (existingApproval) {
    return jsonError(`You have already submitted your ${approverRole} decision`, 409);
  }

  const { error: insertErr } = await admin.from("shortlist_approvals").insert({
    pipeline_candidate_id: pipelineCandidate.id,
    approver_id: ctx.userId,
    approver_role: approverRole,
    decision,
    notes: notes ?? null,
  });

  if (insertErr) {
    logger.error("Failed to record approval", { error: String(insertErr) });
    return jsonError("Failed to record approval", 500);
  }

  void (async () => {
    try {
      const { getRecruitmentPlanByJobId } = await import("@/lib/recruitment-plan/repository");
      const { logPlanHumanEvent } = await import("@/lib/recruitment-plan/log-plan-human-event");
      const { plan } = await getRecruitmentPlanByJobId(admin, jobId);
      if (!plan) return;
      await logPlanHumanEvent(admin, {
        planId: plan.id,
        candidateId,
        actorUserId: ctx.userId,
        eventType: "shortlist_decision",
        description: `${approverRole.replace(/_/g, " ")} ${decision} shortlist`,
        details: { approverRole, decision, notes: notes ?? null },
      });
    } catch (err) {
      logger.warn("plan_history shortlist decision log failed", {
        error: err instanceof Error ? err.message : String(err),
        jobId,
        candidateId,
      });
    }
  })();

  if (decision === "rejected") {
    await admin
      .from("pipeline_candidates")
      .update({ status: "rejected" })
      .eq("id", pipelineCandidate.id);

    const otherRole = approverRole === "recruiter" ? "hiring_manager" : "recruiter";
    const notifyUserId = otherRole === "hiring_manager" ? job.hiring_manager_id : null;

    if (notifyUserId) {
      const ok = await createNotification({
        userId: notifyUserId,
        type: "approval_given",
        title: `Candidate rejected for ${jobTitle ?? "Job"}`,
        body: `A ${approverRole === "recruiter" ? "recruiter" : "hiring manager"} rejected a candidate.`,
        link: `/company/jobs/${jobId}`,
      });
      if (!ok) {
        logger.warn("createNotification failed", {
          route: "POST /api/jobs/[id]/pipeline/approve",
          type: "approval_given",
          userId: notifyUserId,
        });
      }
    }

    return jsonSuccess({ ok: true, status: "rejected", fullyApproved: false });
  }

  // decision === "approved" — check if the other role has also approved
  const { recruiterApproved, hmApproved } = await getDualApprovalStatus(
    admin,
    pipelineCandidate.id,
  );
  const fullyApproved = recruiterApproved && hmApproved;

  if (fullyApproved) {
    await admin
      .from("pipeline_candidates")
      .update({ status: "in_progress" })
      .eq("id", pipelineCandidate.id);

    // Trigger interview scheduling
    if (pipelineCandidate.stage_id) {
      await triggerSchedulerAgent({
        candidateId,
        jobId,
        stageId: pipelineCandidate.stage_id,
      });
    }

    // Notify both HM and recruiters
    const notifyUserIds: string[] = [];
    if (job.hiring_manager_id) notifyUserIds.push(job.hiring_manager_id);

    const { data: orgRecruiters } = await admin
      .from("profiles")
      .select("id")
      .eq("organisation_id", job.organisation_id)
      .in("role", ["recruiter", "leadership"]);

    if (orgRecruiters) {
      for (const r of orgRecruiters) {
        if (!notifyUserIds.includes(r.id)) notifyUserIds.push(r.id);
      }
    }

    for (const uid of notifyUserIds) {
      const ok = await createNotification({
        userId: uid,
        type: "interview_scheduled",
        title: `Interview approved for ${jobTitle ?? "Job"}`,
        body: "Both recruiter and hiring manager approved. Interview scheduling triggered.",
        link: `/company/jobs/${jobId}`,
      });
      if (!ok) {
        logger.warn("createNotification failed", {
          route: "POST /api/jobs/[id]/pipeline/approve",
          type: "interview_scheduled",
          userId: uid,
        });
      }
    }

    return jsonSuccess({ ok: true, status: "approved", fullyApproved: true });
  }

  // Only one side approved — notify the other side
  const otherRole = approverRole === "recruiter" ? "hiring_manager" : "recruiter";
  if (otherRole === "hiring_manager" && job.hiring_manager_id) {
    const okHm = await createNotification({
      userId: job.hiring_manager_id,
      type: "approval_needed",
      title: `Approval needed: candidate for ${jobTitle ?? "Job"}`,
      body: "A recruiter approved a shortlisted candidate. Your approval is required.",
      link: `/company/approvals`,
    });
    if (!okHm) {
      logger.warn("createNotification failed", {
        route: "POST /api/jobs/[id]/pipeline/approve",
        type: "approval_needed",
        userId: job.hiring_manager_id,
      });
    }
  } else if (otherRole === "recruiter") {
    const { data: orgRecruiters } = await admin
      .from("profiles")
      .select("id")
      .eq("organisation_id", job.organisation_id)
      .in("role", ["recruiter", "leadership"]);

    if (orgRecruiters) {
      for (const r of orgRecruiters) {
        const okR = await createNotification({
          userId: r.id,
          type: "approval_needed",
          title: `Verification needed: candidate for ${jobTitle ?? "Job"}`,
          body: "The hiring manager approved a shortlisted candidate. Your verification is required.",
          link: `/recruit/pipeline`,
        });
        if (!okR) {
          logger.warn("createNotification failed", {
            route: "POST /api/jobs/[id]/pipeline/approve",
            type: "approval_needed",
            userId: r.id,
          });
        }
      }
    }
  }

  return jsonSuccess({ ok: true, status: "approved", fullyApproved: false });
}

/**
 * GET /api/jobs/[id]/pipeline/approve
 * Returns approvals for all pipeline candidates in this job.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { assertJobAccess } = await import("@/lib/job-access");
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const { data: pipelineCandidates } = await supabase
    .from("pipeline_candidates")
    .select(
      "id, candidate_id, status, stage_id, created_at, candidates(id, name, email, skills, location)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (!pipelineCandidates) return jsonSuccess({ candidates: [] });

  const pcIds = pipelineCandidates.map((pc: Record<string, unknown>) => pc.id as string);

  const admin = createSupabaseAdmin();
  const { data: approvals } = await admin
    .from("shortlist_approvals")
    .select(
      "pipeline_candidate_id, approver_role, decision, notes, decided_at, profiles!shortlist_approvals_approver_id_fkey(full_name)",
    )
    .in("pipeline_candidate_id", pcIds.length > 0 ? pcIds : ["__none__"]);

  const approvalsByPc: Record<string, unknown[]> = {};
  for (const a of approvals ?? []) {
    const pcId = a.pipeline_candidate_id as string;
    if (!approvalsByPc[pcId]) approvalsByPc[pcId] = [];
    approvalsByPc[pcId].push(a);
  }

  const candidates = pipelineCandidates.map((pc: Record<string, unknown>) => ({
    ...pc,
    approvals: approvalsByPc[pc.id as string] ?? [],
  }));

  return jsonSuccess({ candidates });
}
