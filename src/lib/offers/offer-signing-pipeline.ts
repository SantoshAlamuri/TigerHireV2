import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

async function findStageId(
  admin: SupabaseClient,
  jobId: string,
  predicate: (row: { stage_name: string; stage_type: string | null }) => boolean,
): Promise<string | null> {
  const { data: stages, error } = await admin
    .from("pipeline_stages")
    .select("id, stage_name, stage_type, stage_order")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });
  if (error || !stages?.length) return null;
  for (const s of stages) {
    const name = String(s.stage_name ?? "");
    const st = (s.stage_type as string | null) ?? "";
    if (predicate({ stage_name: name, stage_type: st })) {
      return s.id as string;
    }
  }
  return null;
}

function extractCtcLpa(compensation: Record<string, unknown> | null): number | null {
  if (!compensation) return null;
  const raw = compensation.ctc ?? compensation.expected_ctc_lpa ?? compensation.ctc_lpa;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * When a candidate accepts via native signing: move pipeline to Offer Accepted, set application fields, billing row.
 */
export async function syncPipelineOnNativeOfferAccepted(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    applicationId: string;
    offerId: string;
    compensationJson: Record<string, unknown> | null;
  },
): Promise<void> {
  const { data: app, error: appErr } = await admin
    .from("applications")
    .select("id, job_id, candidate_id, status, expected_ctc_lpa, current_ctc_lpa")
    .eq("id", params.applicationId)
    .maybeSingle();
  if (appErr || !app?.job_id || !app.candidate_id) {
    logger.warn("syncPipelineOnNativeOfferAccepted: missing application", {
      applicationId: params.applicationId,
      error: appErr?.message,
    });
    return;
  }

  const jobId = app.job_id as string;
  const candidateId = app.candidate_id as string;

  const stageId =
    (await findStageId(admin, jobId, ({ stage_name, stage_type }) => {
      return stage_type === "offer" && /accepted/i.test(stage_name);
    })) ??
    (await findStageId(admin, jobId, ({ stage_name }) => /offer accepted/i.test(stage_name)));

  const ctcFromOffer = extractCtcLpa(params.compensationJson);
  const ctcValue =
    ctcFromOffer ??
    (app.expected_ctc_lpa as number | null) ??
    (app.current_ctc_lpa as number | null) ??
    null;
  const billingCtcRequired = ctcValue == null || Number.isNaN(Number(ctcValue));

  // Single transactional RPC: move pipeline stage, stamp the application
  // offer-accepted, and record the placement-fee billing row together — so an
  // accepted offer can never land without its billing event.
  const { error: rpcErr } = await admin.rpc("accept_native_offer", {
    p_application_id: params.applicationId,
    p_organisation_id: params.organisationId,
    p_job_id: jobId,
    p_candidate_id: candidateId,
    p_offer_id: params.offerId,
    p_stage_id: stageId,
    p_ctc_value: ctcValue != null && !Number.isNaN(Number(ctcValue)) ? Number(ctcValue) : null,
    p_billing_ctc_required: billingCtcRequired,
  });

  if (rpcErr) {
    logger.error("syncPipelineOnNativeOfferAccepted: accept_native_offer RPC failed", {
      applicationId: params.applicationId,
      jobId,
      candidateId,
      error: rpcErr.message,
    });
    throw new Error(`accept_native_offer failed: ${rpcErr.message}`);
  }
}

/**
 * When a candidate declines: move to Rejected terminal stage and mark application rejected.
 */
export async function syncPipelineOnNativeOfferDeclined(
  admin: SupabaseClient,
  params: { applicationId: string },
): Promise<void> {
  const { data: app, error: appErr } = await admin
    .from("applications")
    .select("id, job_id, candidate_id")
    .eq("id", params.applicationId)
    .maybeSingle();
  if (appErr || !app?.job_id || !app.candidate_id) return;

  const jobId = app.job_id as string;
  const candidateId = app.candidate_id as string;

  const stageId =
    (await findStageId(admin, jobId, ({ stage_name, stage_type }) => {
      return (
        stage_type === "terminal_reject" &&
        /reject/i.test(stage_name) &&
        !/withdraw/i.test(stage_name)
      );
    })) ??
    (await findStageId(admin, jobId, ({ stage_name }) => /^rejected$/i.test(stage_name.trim())));

  const { data: pc } = await admin
    .from("pipeline_candidates")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (pc?.id && stageId) {
    await admin
      .from("pipeline_candidates")
      .update({
        stage_id: stageId,
        status: "rejected",
      })
      .eq("id", pc.id as string);
  }

  await admin
    .from("applications")
    .update({
      status: "rejected",
      stage_type: "terminal_reject",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.applicationId);
}
