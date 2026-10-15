import type { SupabaseClient } from "@supabase/supabase-js";
import { getDualApprovalStatus } from "@/lib/pipeline-approvals";
import { resolvePlanStageForPipelineStage } from "./resolve-plan-stage-for-pipeline";
import type { PlanApprovalGate } from "./types";

function gateBlockMessage(gate: PlanApprovalGate): string {
  switch (gate) {
    case "recruiter":
      return "Recruiter shortlist approval is required before moving into this stage. Complete it in Tasks.";
    case "hm":
      return "Hiring manager shortlist approval is required before moving into this stage. Complete it in Tasks.";
    case "recruiter_and_hm":
      return "Recruiter and hiring manager must approve the shortlist in Tasks before moving into this stage.";
    case "finance_recruiter_hm":
      return "Shortlist and offer finance approvals must be completed in Tasks before moving into the offer stage.";
    default:
      return "Required approvals are not complete. Check Tasks.";
  }
}

/**
 * Enforces plan_stages.approval_gate when advancing a candidate in pipeline.
 * Returns ok:false with a user-facing message when the gate is not satisfied.
 */
export async function assertPlanApprovalGateForPipelineMove(
  admin: SupabaseClient,
  params: {
    jobId: string;
    pipelineCandidateId: string;
    targetPipelineStageId: string;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await resolvePlanStageForPipelineStage(
    admin,
    params.jobId,
    params.targetPipelineStageId,
  );
  if (!ctx) return { ok: true };

  const gate = ctx.planStage.approval_gate;
  if (!gate || gate === "none") return { ok: true };

  const dual = await getDualApprovalStatus(admin, params.pipelineCandidateId);

  if (gate === "recruiter" && !dual.recruiterApproved) {
    return { ok: false, message: gateBlockMessage(gate) };
  }
  if (gate === "hm" && !dual.hmApproved) {
    return { ok: false, message: gateBlockMessage(gate) };
  }
  if (gate === "recruiter_and_hm" && (!dual.recruiterApproved || !dual.hmApproved)) {
    return { ok: false, message: gateBlockMessage(gate) };
  }

  if (gate === "finance_recruiter_hm") {
    if (!dual.recruiterApproved || !dual.hmApproved) {
      return { ok: false, message: gateBlockMessage(gate) };
    }

    const { data: pc } = await admin
      .from("pipeline_candidates")
      .select("candidate_id")
      .eq("id", params.pipelineCandidateId)
      .maybeSingle();

    const candidateId = pc?.candidate_id as string | undefined;
    if (!candidateId) return { ok: true };

    const { data: app } = await admin
      .from("applications")
      .select("id")
      .eq("job_id", params.jobId)
      .eq("candidate_id", candidateId)
      .maybeSingle();

    const applicationId = app?.id as string | undefined;
    if (!applicationId) return { ok: true };

    const { data: offer } = await admin
      .from("offers")
      .select("id")
      .eq("application_id", applicationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const offerId = offer?.id as string | undefined;
    if (!offerId) {
      return {
        ok: false,
        message:
          "Draft and submit the offer for finance review in Tasks before moving into the offer stage.",
      };
    }

    const { data: instance } = await admin
      .from("workflow_instances")
      .select("id, status")
      .eq("subject_type", "offer")
      .eq("subject_id", offerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (instance?.status === "active") {
      return {
        ok: false,
        message:
          "Offer finance approval is still in progress. Complete the decision in Tasks before moving into the offer stage.",
      };
    }
    if (instance?.status !== "completed") {
      return { ok: false, message: gateBlockMessage(gate) };
    }
  }

  return { ok: true };
}
