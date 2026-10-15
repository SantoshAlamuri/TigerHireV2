import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { isEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/observability/logger";
import { dispatchRecallBot } from "@/lib/integrations/notetaker/recall";

export const FEATURE_FLAG_NOTETAKER_RECALL = "notetaker_recall";

export interface NotetakerDispatchInput {
  admin: SupabaseClient;
  slotId: string;
  organisationId: string | null | undefined;
  jobId?: string | null;
  jobTitle?: string | null;
  candidateName?: string | null;
  pipelineCandidateId?: string | null;
  slotStartAt: string;
}

export type NotetakerDispatchResult =
  | { status: "dispatched"; recordingId: string; recallBotId: string }
  | { status: "skipped"; reason: string };

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Returns true when the org's notetaker spend this month already meets/exceeds its INR cap.
 * Pre-dispatch we can only weigh already-incurred cost; a null cap means "no cap".
 */
async function isMonthlyCapReached(
  admin: SupabaseClient,
  organisationId: string,
  capInr: number | null,
): Promise<boolean> {
  if (capInr == null || capInr <= 0) return false;
  const { data, error } = await admin
    .from("interview_recordings")
    .select("cost_usd")
    .eq("organisation_id", organisationId)
    .gte("created_at", startOfMonthIso());
  if (error) {
    logger.warn("notetaker_cap_lookup_failed", { organisationId, error: String(error) });
    return false; // fail open on lookup error — dispatch guard is best-effort, not a billing gate
  }
  const spentUsd = (data ?? []).reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
  return spentUsd * env.usdToInrRate >= capInr;
}

/**
 * Best-effort: dispatch a Recall notetaker bot to a freshly booked interview. Gated by the
 * global `notetaker_recall` flag, the per-org `notetaker_enabled` toggle, presence of a manual
 * meeting link on the slot, and the monthly INR cap. Never throws — callers must not let a
 * notetaker failure break interview-invite delivery.
 */
export async function maybeDispatchNotetakerBot(
  input: NotetakerDispatchInput,
): Promise<NotetakerDispatchResult> {
  const { admin, slotId, organisationId } = input;
  try {
    if (!organisationId) return { status: "skipped", reason: "no_organisation" };
    if (!(await isEnabled(FEATURE_FLAG_NOTETAKER_RECALL, organisationId))) {
      return { status: "skipped", reason: "flag_off" };
    }

    const { data: org } = await admin
      .from("organisations")
      .select("notetaker_enabled, notetaker_monthly_cap_inr")
      .eq("id", organisationId)
      .maybeSingle<{ notetaker_enabled: boolean; notetaker_monthly_cap_inr: number | null }>();
    if (!org?.notetaker_enabled) return { status: "skipped", reason: "org_disabled" };

    const { data: slot } = await admin
      .from("interview_availability_slots")
      .select("meeting_url")
      .eq("id", slotId)
      .maybeSingle<{ meeting_url: string | null }>();
    const meetingUrl = slot?.meeting_url?.trim();
    if (!meetingUrl) return { status: "skipped", reason: "no_meeting_url" };

    if (await isMonthlyCapReached(admin, organisationId, org.notetaker_monthly_cap_inr)) {
      logger.info("notetaker_dispatch_capped", { organisationId, slotId });
      return { status: "skipped", reason: "monthly_cap_reached" };
    }

    // Insert the ledger row first so the webhook can correlate even on a slow bot response.
    const { data: recording, error: insertError } = await admin
      .from("interview_recordings")
      .insert({
        organisation_id: organisationId,
        slot_id: slotId,
        pipeline_candidate_id: input.pipelineCandidateId ?? null,
        job_id: input.jobId ?? null,
        meeting_url: meetingUrl,
        status: "queued",
      })
      .select("id")
      .single<{ id: string }>();
    if (insertError || !recording) {
      logger.warn("notetaker_recording_insert_failed", {
        organisationId,
        slotId,
        error: String(insertError),
      });
      return { status: "skipped", reason: "insert_failed" };
    }

    try {
      const { recall_bot_id } = await dispatchRecallBot({
        meetingUrl,
        joinAt: input.slotStartAt,
        botName: input.jobTitle ? `Notetaker — ${input.jobTitle}` : undefined,
        metadata: {
          slot_id: slotId,
          organisation_id: organisationId,
          recording_id: recording.id,
        },
      });
      await admin
        .from("interview_recordings")
        .update({ recall_bot_id, status: "joining", updated_at: new Date().toISOString() })
        .eq("id", recording.id);
      logger.info("notetaker_dispatched", { organisationId, slotId, recallBotId: recall_bot_id });
      return { status: "dispatched", recordingId: recording.id, recallBotId: recall_bot_id };
    } catch (dispatchErr) {
      await admin
        .from("interview_recordings")
        .update({
          status: "failed",
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
          updated_at: new Date().toISOString(),
        })
        .eq("id", recording.id);
      logger.warn("notetaker_dispatch_failed", {
        organisationId,
        slotId,
        error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
      });
      return { status: "skipped", reason: "dispatch_error" };
    }
  } catch (err) {
    logger.warn("notetaker_dispatch_unexpected_error", {
      slotId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "skipped", reason: "unexpected_error" };
  }
}
