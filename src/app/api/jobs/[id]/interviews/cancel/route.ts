import { cancelBookedEvent } from "@/lib/calendar/interviews";
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
import { assertJobAccess } from "@/lib/job-access";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { onInterviewTransition } from "@/lib/interviews/notifier";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

function isMissingRpcFunction(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? error ?? "");
  return (
    message.includes("th_cancel_interview_slot") &&
    (message.includes("Could not find the function") || message.includes("PGRST202"))
  );
}

/**
 * POST /api/jobs/[id]/interviews/cancel
 * Cancel a booked interview slot. Body: { slot_id: string }
 * Frees the slot (status=available, pipeline_candidate_id=null) and clears
 * pipeline_candidates.interview_scheduled_at and reminder_sent_at.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const parsed = await parseJsonBody<{ slot_id?: string }>(
    request,
    "POST /api/jobs/[id]/interviews/cancel",
  );
  if (parsed.errorResponse) return parsed.errorResponse;
  const body = parsed.body;
  const slot_id = body?.slot_id;
  if (!slot_id) return jsonError("slot_id is required", 400);

  const { data: slot, error: slotErr } = await supabase
    .from("interview_availability_slots")
    .select("id, job_id, user_id, start_at, end_at, status, pipeline_candidate_id")
    .eq("id", slot_id)
    .eq("job_id", jobId)
    .single();

  if (slotErr || !slot) return jsonError("Slot not found", 404);
  if (slot.status !== "booked" || !slot.pipeline_candidate_id)
    return jsonError("Slot is not booked", 409);
  let usedAtomicRpc = false;

  const rpcClient = supabase as typeof supabase & {
    rpc?: (
      fn: string,
      args: { p_job_id: string; p_slot_id: string },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  if (typeof rpcClient.rpc === "function") {
    const admin = createSupabaseAdmin();
    const { data: rpcData, error: rpcError } = await admin.rpc("th_cancel_interview_slot", {
      p_job_id: jobId,
      p_slot_id: slot_id,
    });
    if (rpcError && !isMissingRpcFunction(rpcError)) {
      logger.error("Atomic cancel RPC failed", { error: String(rpcError) });
      return jsonError("Failed to cancel slot", 500);
    }
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const result = rpcData[0] as { success?: boolean; error_code?: string | null };
      if (result.success) {
        usedAtomicRpc = true;
      } else if (result.error_code === "slot_not_booked") {
        return jsonError("Slot is not booked", 409);
      } else {
        return jsonError("Failed to cancel slot", 500);
      }
    }
  }

  if (!usedAtomicRpc) {
    const { error: updateSlotErr } = await supabase
      .from("interview_availability_slots")
      .update({ status: "available", pipeline_candidate_id: null })
      .eq("id", slot_id)
      .eq("job_id", jobId);

    if (updateSlotErr) {
      logger.error("Failed to cancel slot", { error: String(updateSlotErr) });
      return jsonError("Failed to cancel slot", 500);
    }

    const { error: updatePcErr } = await supabase
      .from("pipeline_candidates")
      .update({ interview_scheduled_at: null, reminder_sent_at: null })
      .eq("id", slot.pipeline_candidate_id);

    if (updatePcErr) {
      await supabase
        .from("interview_availability_slots")
        .update({ status: "booked", pipeline_candidate_id: slot.pipeline_candidate_id })
        .eq("id", slot_id)
        .eq("job_id", jobId)
        .eq("status", "available");
      logger.error("Failed to clear interview_scheduled_at on cancel", {
        error: String(updatePcErr),
      });
      return jsonError("Failed to cancel slot", 500);
    }
  }

  // Take it off the organiser's calendar too (attendees get the cancellation).
  try {
    await cancelBookedEvent(createSupabaseAdmin(), slot_id, slot.user_id ?? null);
  } catch (calErr) {
    logger.warn("calendar_cancel_failed", { slotId: slot_id, error: String(calErr) });
  }

  try {
    const { data: pcData } = await supabase
      .from("pipeline_candidates")
      .select("candidate_id, candidates(name, email)")
      .eq("id", slot.pipeline_candidate_id)
      .single();

    const { data: jobData } = await supabase.from("jobs").select("title").eq("id", jobId).single();

    const candidate = pcData?.candidates as {
      name?: string;
      email?: string;
      phone?: string;
    } | null;
    let interviewerEmail: string | null = null;
    let interviewerName: string | null = null;
    let interviewerPhone: string | null = null;
    if (slot.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", slot.user_id)
        .maybeSingle();
      interviewerEmail = (profile?.email as string | undefined) ?? null;
      interviewerName = (profile?.full_name as string | undefined) ?? null;
      interviewerPhone = (profile?.phone as string | undefined) ?? null;
    }
    await onInterviewTransition("booked", "cancelled", {
      jobId,
      jobTitle: jobData?.title ?? "Interview",
      pipelineCandidateId: slot.pipeline_candidate_id,
      candidateId: (pcData?.candidate_id as string | undefined) ?? null,
      candidateName: candidate?.name ?? null,
      candidateEmail: candidate?.email ?? null,
      candidatePhone: candidate?.phone ?? null,
      interviewerEmail,
      interviewerName,
      interviewerPhone,
      slotStartAt: slot.start_at,
      slotEndAt: slot.end_at,
    });
  } catch (emailErr) {
    logger.warn("Failed to send interview cancelled email", {
      error: String(emailErr),
    });
  }

  return jsonSuccess({ cancelled: true, slot_id });
}
