import { NextRequest } from "next/server";
import { z } from "zod";
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
import { validateOrigin } from "@/lib/security/csrf";
import { assertJobAccess } from "@/lib/job-access";
import { AGENCY_STAGE_KEYS, isAgencyStageVisibleToCompany } from "@/lib/constants/agency-stages";
import { fireAgencyShareNotification } from "@/lib/acknowledgements/trigger-agency-share-notification";
import { logger } from "@/lib/observability/logger";
import { sendApplicationStatusUpdate, sendPipelineStageUpdateEmail } from "@/lib/services/resend";
import { recordOfferAcceptedBillingEvent } from "@/lib/placement-fee/record-offer-billing";
import {
  notifyCandidateShortlisted,
  notifyCandidateRejected,
  notifyCandidateOffer,
  sendWhatsAppMessage,
} from "@/lib/services/whatsapp";
import { enqueue } from "@/lib/jobs/queue";
import { upsertHiringOutcome } from "@/lib/services/hiring-outcomes";
import { triggerPayoutIfEligible } from "@/lib/agents/payout-trigger";
import { recordPipelineActionSignals } from "@/lib/services/pipeline-action-signals";
import {
  sendReferrerOfferNotification,
  sendReferrerRejectionNotification,
} from "@/lib/whatsapp/referrer-notifications";
import { logPipelineStageTransition } from "@/lib/analytics/log-pipeline-stage-transition";
import { assertPlanApprovalGateForPipelineMove } from "@/lib/recruitment-plan/check-plan-approval-gate";
import { logPlanHumanEvent } from "@/lib/recruitment-plan/log-plan-human-event";
import { dispatchPlanStageOnCandidateMove } from "@/lib/recruitment-plan/plan-stage-dispatch";
import {
  maybeStartPostShortlistScreening,
  isShortlistStageName,
} from "@/lib/prescreen/post-shortlist-trigger";
import { getRecruitmentPlanByJobId } from "@/lib/recruitment-plan/repository";

const pipelinePatchSchema = z
  .object({
    stage_id: z.string().uuid().nullable().optional(),
    status: z.enum(["shortlisted", "in_progress", "hired", "rejected"]).optional(),
    agency_stage: z.string().optional(),
    override_reason: z.enum(["strong_interview", "cultural_fit", "referral", "other"]).optional(),
    override_reason_text: z.string().max(500).optional(),
  })
  .strict();

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;
const STAGE_MUTATION_ROLES = ["super_admin", "leadership", "recruiter"] as const;

type RouteContext = {
  params: Promise<{ id: string; pcId: string }>;
};

function inferStageWhatsAppType(
  stageType: string | null | undefined,
  stageName: string | null | undefined,
): "shortlisted" | "rejected" | "offer" | "generic" {
  const t = (stageType ?? "").toLowerCase();
  const n = (stageName ?? "").toLowerCase();

  if (t === "terminal_reject" || n.includes("reject") || n.includes("not selected")) {
    return "rejected";
  }
  if (t === "offer" || t === "terminal_hired" || n.includes("offer")) {
    return "offer";
  }
  if (n.includes("shortlist") || n.includes("final shortlist")) {
    return "shortlisted";
  }
  return "generic";
}

/**
 * PATCH /api/jobs/[id]/pipeline/candidates/[pcId]
 * Update a pipeline candidate's stage (and optionally status). Body: { stage_id?: string, status?: string }
 * stage_id must be a stage belonging to this job; use null to clear stage.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId, pcId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const parsedBody = await parseJsonBody(
    request,
    "PATCH /api/jobs/[id]/pipeline/candidates/[pcId]",
  );
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const bodyParsed = pipelinePatchSchema.safeParse(parsedBody.body);
  if (!bodyParsed.success) {
    return jsonError(bodyParsed.error.issues.map((e) => e.message).join(", "), 400);
  }
  const body = bodyParsed.data;

  if (body.stage_id !== undefined && !hasRole(ctx, ...STAGE_MUTATION_ROLES)) {
    return jsonError("Only admins or recruiters can change pipeline stage", 403);
  }

  const { data: pc, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("id, job_id, candidate_id, stage_id, status, agency_stage")
    .eq("id", pcId)
    .eq("job_id", jobId)
    .single();

  if (pcErr || !pc) return jsonError("Pipeline candidate not found", 404);

  const updates: {
    stage_id?: string | null;
    status?: string;
    agency_stage?: string;
    override_reason?: string | null;
    override_reason_text?: string | null;
  } = {};
  let resolvedStageName: string | null = null;
  if (body.stage_id !== undefined) {
    if (body.stage_id === null) {
      updates.stage_id = null;
    } else {
      const { data: stage, error: stageErr } = await supabase
        .from("pipeline_stages")
        .select("id, stage_name")
        .eq("id", body.stage_id)
        .eq("job_id", jobId)
        .single();
      if (stageErr || !stage) return jsonError("Stage not found for this job", 400);
      updates.stage_id = body.stage_id;
      resolvedStageName = stage.stage_name ?? null;
    }
  }
  if (body.status !== undefined) {
    updates.status = body.status;
  }
  if (body.agency_stage !== undefined) {
    if (!AGENCY_STAGE_KEYS.includes(body.agency_stage)) {
      return jsonError(`Invalid agency_stage. Allowed: ${AGENCY_STAGE_KEYS.join(", ")}`, 400);
    }
    updates.agency_stage = body.agency_stage;
  }
  if (body.override_reason !== undefined) {
    updates.override_reason = body.override_reason;
  }
  if (body.override_reason_text !== undefined) {
    updates.override_reason_text = body.override_reason_text || null;
  }

  if (Object.keys(updates).length === 0) {
    return jsonSuccess({ pipeline_candidate: pc });
  }

  if (body.stage_id !== undefined && body.stage_id !== null) {
    const adminForGate = createSupabaseAdmin();
    const gate = await assertPlanApprovalGateForPipelineMove(adminForGate, {
      jobId,
      pipelineCandidateId: pcId,
      targetPipelineStageId: body.stage_id,
    });
    if (!gate.ok) return jsonError(gate.message, 409);
  }

  let priorStageNameForLog: string | null | undefined;
  if (body.stage_id !== undefined) {
    if (pc.stage_id) {
      const { data: fromSt } = await supabase
        .from("pipeline_stages")
        .select("stage_name")
        .eq("id", pc.stage_id as string)
        .eq("job_id", jobId)
        .maybeSingle();
      priorStageNameForLog = (fromSt?.stage_name as string | undefined) ?? null;
    } else {
      priorStageNameForLog = null;
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("pipeline_candidates")
    .update(updates)
    .eq("id", pcId)
    .eq("job_id", jobId)
    .select(
      "id, job_id, candidate_id, stage_id, status, agency_stage, override_reason, override_reason_text",
    )
    .single();

  if (updateErr) {
    logger.error("Failed to update pipeline candidate", {
      error: String(updateErr),
      pcId,
      jobId,
    });
    return jsonError("Failed to update pipeline candidate", 500);
  }

  if (
    body.agency_stage === "shared_with_company" &&
    hasRole(ctx, "agency") &&
    updated &&
    !isAgencyStageVisibleToCompany((pc.agency_stage as string | null) ?? null)
  ) {
    fireAgencyShareNotification({
      jobId,
      candidateId: updated.candidate_id as string,
      agencyOrganisationId: ctx.organisationId,
    });
  }

  if (body.stage_id !== undefined && updated && body.stage_id !== null) {
    void dispatchPlanStageOnCandidateMove({
      jobId,
      organisationId: job.organisation_id as string,
      pipelineCandidateId: updated.id as string,
      candidateId: updated.candidate_id as string,
      pipelineStageId: body.stage_id as string,
      initiatedBy: ctx.userId,
    });
    void maybeStartPostShortlistScreening({
      jobId,
      candidateId: updated.candidate_id as string,
      organisationId: job.organisation_id as string,
      stageName: resolvedStageName,
    });
  }

  if (body.stage_id !== undefined && updated) {
    const toLabel = body.stage_id === null ? "(no stage)" : (resolvedStageName ?? "(no stage)");
    logPipelineStageTransition(supabase, {
      jobId,
      candidateId: updated.candidate_id as string,
      pipelineCandidateId: updated.id as string,
      fromStage: priorStageNameForLog ?? null,
      toStage: toLabel,
      movedBy: ctx.userId,
    });

    if (body.stage_id !== null && ctx.userId) {
      void (async () => {
        try {
          const admin = createSupabaseAdmin();
          const { plan } = await getRecruitmentPlanByJobId(admin, jobId);
          if (!plan) return;
          const fromLabel = priorStageNameForLog ?? "—";
          await logPlanHumanEvent(admin, {
            planId: plan.id,
            candidateId: updated.candidate_id as string,
            actorUserId: ctx.userId,
            eventType: "pipeline_stage_moved",
            description: `Moved ${fromLabel} → ${toLabel}`,
            details: {
              pipelineStageId: body.stage_id,
              fromStage: priorStageNameForLog,
              toStage: toLabel,
            },
          });
        } catch (err) {
          logger.warn("plan_history human pipeline move log failed", {
            error: err instanceof Error ? err.message : String(err),
            jobId,
            pcId,
          });
        }
      })();
    }
  }

  if (body.stage_id !== undefined && updated && body.stage_id !== null) {
    void (async () => {
      try {
        const admin = createSupabaseAdmin();
        const { data: st } = await admin
          .from("pipeline_stages")
          .select("stage_name, stage_type, notify_candidate, notify_email_body")
          .eq("id", body.stage_id as string)
          .eq("job_id", jobId)
          .maybeSingle();
        if (!st) return;
        const stageName = (st.stage_name as string) ?? "";
        const stageType = st.stage_type as string;

        const { data: app } = await admin
          .from("applications")
          .select("id, status, expected_ctc_lpa, current_ctc_lpa")
          .eq("job_id", jobId)
          .eq("candidate_id", updated.candidate_id as string)
          .maybeSingle();

        let nextStatus: string | undefined;
        if (stageType === "terminal_hired") nextStatus = "hired";
        else if (stageType === "terminal_reject")
          nextStatus = /withdraw/i.test(stageName) ? "withdrawn" : "rejected";
        else if (isShortlistStageName(stageName)) nextStatus = "shortlisted";
        else if (
          ["interview", "offer", "assessment", "screening"].includes(stageType) ||
          stageType === "system_auto"
        ) {
          const cur = (app?.status as string) ?? "applied";
          if (cur === "applied" || cur === "shortlisted" || cur === "viewed")
            nextStatus = "in_progress";
        }

        const offerAcceptedLike = stageType === "offer" && /accepted/i.test(stageName);
        const billingTrigger = offerAcceptedLike || stageType === "terminal_hired";
        const ctcValue =
          (app?.expected_ctc_lpa as number | null) ??
          (app?.current_ctc_lpa as number | null) ??
          null;
        const billingCtcRequired =
          billingTrigger && (ctcValue == null || Number.isNaN(Number(ctcValue)));

        const appPatch: Record<string, unknown> = {
          stage_type: stageType,
          updated_at: new Date().toISOString(),
          billing_ctc_required: billingCtcRequired,
        };
        if (offerAcceptedLike) {
          appPatch.offer_accepted_at = new Date().toISOString();
        }
        if (nextStatus) appPatch.status = nextStatus;

        if (app?.id) {
          await admin
            .from("applications")
            .update(appPatch)
            .eq("id", app.id as string);
        }

        if (billingTrigger && app?.id) {
          await recordOfferAcceptedBillingEvent(admin, {
            organisationId: job.organisation_id as string,
            jobId,
            candidateId: updated.candidate_id as string,
            applicationId: app.id as string,
            ctcValue: ctcValue != null && !Number.isNaN(Number(ctcValue)) ? Number(ctcValue) : null,
          });
        }

        if (st.notify_candidate) {
          const { data: cand } = await admin
            .from("candidates")
            .select("email, name, phone")
            .eq("id", updated.candidate_id as string)
            .maybeSingle();
          const { data: jobRow } = await admin
            .from("jobs")
            .select("title")
            .eq("id", jobId)
            .maybeSingle();
          const { data: org } = await admin
            .from("organisations")
            .select("name")
            .eq("id", job.organisation_id as string)
            .maybeSingle();
          if (cand?.email) {
            await sendPipelineStageUpdateEmail({
              candidateEmail: cand.email as string,
              candidateName: (cand.name as string) ?? "there",
              jobTitle: (jobRow?.title as string) ?? "the role",
              companyName: (org?.name as string) ?? "the company",
              stageName,
              customBodyHtml: (st.notify_email_body as string | null) ?? null,
            });
          }

          if (cand?.phone) {
            const { data: appForWa } = await admin
              .from("applications")
              .select("id")
              .eq("candidate_id", updated.candidate_id as string)
              .eq("job_id", jobId)
              .maybeSingle();

            const applicationId = (appForWa?.id as string | undefined) ?? undefined;
            const candidateName = (cand.name as string) ?? "there";
            const jobTitle = (jobRow?.title as string) ?? "the role";
            const companyName = (org?.name as string) ?? "the company";
            const waType = inferStageWhatsAppType(stageType, stageName);

            if (waType === "shortlisted") {
              await notifyCandidateShortlisted({
                phone: cand.phone as string,
                candidateName,
                jobTitle,
                companyName,
                applicationId,
              });
            } else if (waType === "rejected") {
              await notifyCandidateRejected({
                phone: cand.phone as string,
                candidateName,
                jobTitle,
                companyName,
                applicationId,
              });
            } else if (waType === "offer") {
              await notifyCandidateOffer({
                phone: cand.phone as string,
                candidateName,
                jobTitle,
                companyName,
                applicationId,
              });
            } else {
              await sendWhatsAppMessage(
                cand.phone as string,
                `Update: your application for ${jobTitle} at ${companyName} moved to "${stageName}". We'll keep you posted.`,
              );
            }
          }
        }
      } catch (err) {
        logger.warn("Pipeline stage sync / notify failed", {
          error: err instanceof Error ? err.message : String(err),
          jobId,
          pcId,
        });
      }
    })();
  }

  const signalsAdmin = createSupabaseAdmin();
  if (
    updates.status === "shortlisted" ||
    updates.status === "rejected" ||
    updates.status === "hired"
  ) {
    const actionMap = { shortlisted: "shortlist", rejected: "reject", hired: "hire" } as const;
    void recordPipelineActionSignals(signalsAdmin, {
      jobId,
      organisationId: job.organisation_id as string,
      action: actionMap[updates.status as keyof typeof actionMap],
      submittedBy: ctx.userId,
      entries: [
        {
          candidateId: updated.candidate_id as string,
          pipelineCandidateId: updated.id as string,
          metadata: { route: "pipeline-candidate-patch" },
        },
      ],
    });
  }
  if (updates.stage_id) {
    const action = (resolvedStageName ?? "").toLowerCase().includes("interview")
      ? "move_to_interview"
      : "move_stage";
    void recordPipelineActionSignals(signalsAdmin, {
      jobId,
      organisationId: job.organisation_id as string,
      action,
      submittedBy: ctx.userId,
      entries: [
        {
          candidateId: updated.candidate_id as string,
          pipelineCandidateId: updated.id as string,
          stageId: updates.stage_id,
          stageName: resolvedStageName,
          metadata: { route: "pipeline-candidate-patch" },
        },
      ],
    });
  }

  if (updates.status) {
    const statusMap: Record<string, string> = {
      hired: "hired",
      rejected: "rejected",
      shortlisted: "shortlisted",
    };
    const appStatus = statusMap[updates.status];
    if (appStatus && updated?.candidate_id) {
      await supabase
        .from("applications")
        .update({ status: appStatus, updated_at: new Date().toISOString() })
        .eq("candidate_id", updated.candidate_id)
        .eq("job_id", jobId);

      if (appStatus === "shortlisted" || appStatus === "hired") {
        void (async () => {
          try {
            await triggerPayoutIfEligible({
              supabase: createSupabaseAdmin(),
              candidateId: updated.candidate_id as string,
              jobId,
              newStatus: appStatus,
            });
          } catch (err) {
            logger.warn("Pipeline status sync: payout trigger failed", {
              error: err instanceof Error ? err.message : String(err),
              jobId,
              candidateId: updated.candidate_id,
            });
          }
        })();
      }

      // Referrer WhatsApp (applications.direct_referrer_id → referrers; no applications.referrer_id in schema).
      if (updates.status === "hired" || updates.status === "rejected") {
        void (async () => {
          try {
            const admin = createSupabaseAdmin();
            const { data: appRow } = await admin
              .from("applications")
              .select("id, direct_referrer_id")
              .eq("candidate_id", updated.candidate_id as string)
              .eq("job_id", jobId)
              .maybeSingle();
            const rid = appRow?.direct_referrer_id as string | null | undefined;
            const aid = appRow?.id as string | undefined;
            if (!rid || !aid) return;
            if (updates.status === "hired") {
              await sendReferrerOfferNotification(rid, aid);
            } else {
              await sendReferrerRejectionNotification(rid, aid);
            }
          } catch (err) {
            logger.warn("Referrer pipeline WhatsApp notification failed", {
              error: err instanceof Error ? err.message : String(err),
              jobId,
              pcId,
            });
          }
        })();
      }

      const notifyStatuses = ["shortlisted", "hired", "rejected"];
      if (notifyStatuses.includes(updates.status)) {
        try {
          const admin = createSupabaseAdmin();
          const { data: candidateRow } = await admin
            .from("candidates")
            .select("email, name, phone")
            .eq("id", updated.candidate_id)
            .single();
          const { data: jobRow } = await admin
            .from("jobs")
            .select("title, organisation_id")
            .eq("id", jobId)
            .single();
          const { data: orgRow } = jobRow?.organisation_id
            ? await admin
                .from("organisations")
                .select("name")
                .eq("id", jobRow.organisation_id)
                .single()
            : { data: null };
          const candidateName = candidateRow?.name ?? "Candidate";
          const jobTitle = jobRow?.title ?? "the role";
          const companyName = orgRow?.name ?? "the company";

          if (candidateRow?.email && jobRow?.title) {
            await sendApplicationStatusUpdate({
              candidateEmail: candidateRow.email,
              candidateName,
              jobTitle,
              companyName,
              status: updates.status as "shortlisted" | "hired" | "rejected",
            });
          }

          if (candidateRow?.phone) {
            const { data: appForWa } = await admin
              .from("applications")
              .select("id")
              .eq("candidate_id", updated.candidate_id)
              .eq("job_id", jobId)
              .maybeSingle();
            const applicationId = (appForWa?.id as string | undefined) ?? undefined;
            const waParams = {
              phone: candidateRow.phone,
              candidateName,
              jobTitle,
              companyName,
              applicationId,
            };
            if (updates.status === "shortlisted") {
              await notifyCandidateShortlisted(waParams);
            } else if (updates.status === "rejected") {
              await notifyCandidateRejected(waParams);
            } else if (updates.status === "hired") {
              await notifyCandidateOffer(waParams);
              // Post-hire pulse check-ins are handled by the daily scheduled Inngest function
              // which checks for hires that are 30/60/90 days old
            }
          }
        } catch (notifyErr) {
          logger.warn("Failed to send status notification", {
            pcId,
            jobId,
            error: String(notifyErr),
          });
        }
      }

      if ((updates.status === "hired" || updates.status === "rejected") && updated?.candidate_id) {
        const admin = createSupabaseAdmin();
        await upsertHiringOutcome(admin, {
          jobId,
          candidateId: updated.candidate_id,
          outcome: updates.status,
          recordedByUserId: ctx.userId,
          source: "manual",
          sourceEventId: `pipeline-status:${pcId}:${updates.status}`,
        });
      }
    }
  }

  return jsonSuccess({ pipeline_candidate: updated });
}

/**
 * DELETE /api/jobs/[id]/pipeline/candidates/[pcId]
 * Removes the pipeline row (and related shortlist rows via CASCADE).
 * Updates the application to rejected without sending email or WhatsApp (quiet removal).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId, pcId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const { data: pc, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("id, job_id, candidate_id")
    .eq("id", pcId)
    .eq("job_id", jobId)
    .single();

  if (pcErr || !pc) return jsonError("Pipeline candidate not found", 404);

  const { error: delErr } = await supabase
    .from("pipeline_candidates")
    .delete()
    .eq("id", pcId)
    .eq("job_id", jobId);

  if (delErr) {
    logger.error("Failed to delete pipeline candidate", {
      error: String(delErr),
      pcId,
      jobId,
    });
    return jsonError("Failed to remove from pipeline", 500);
  }

  const admin = createSupabaseAdmin();
  const { error: appErr } = await admin
    .from("applications")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("candidate_id", pc.candidate_id as string)
    .eq("job_id", jobId);

  if (appErr) {
    logger.warn("Pipeline row deleted but application status sync failed", {
      error: String(appErr),
      pcId,
      jobId,
      candidateId: pc.candidate_id,
    });
  }

  try {
    await upsertHiringOutcome(admin, {
      jobId,
      candidateId: pc.candidate_id as string,
      outcome: "rejected",
      recordedByUserId: ctx.userId,
      source: "manual",
      sourceEventId: `pipeline-delete:${pcId}:rejected`,
    });
  } catch (outcomeErr) {
    logger.warn("Pipeline delete: hiring outcome upsert failed", {
      error: String(outcomeErr),
      pcId,
      jobId,
    });
  }

  return jsonSuccess({ deleted: true });
}
