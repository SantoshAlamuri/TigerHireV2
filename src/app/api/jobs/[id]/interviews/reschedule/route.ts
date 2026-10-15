import { cancelBookedEvent, syncBookedEvent } from "@/lib/calendar/interviews";
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
    message.includes("th_reschedule_interview_slot") &&
    (message.includes("Could not find the function") || message.includes("PGRST202"))
  );
}

/**
 * POST /api/jobs/[id]/interviews/reschedule
 * Move a booked interview to a different slot. Body: { slot_id: string, new_slot_id: string }
 * Frees the current slot, books the new slot, updates pipeline_candidates.interview_scheduled_at.
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

  const parsed = await parseJsonBody<{ slot_id?: string; new_slot_id?: string }>(
    request,
    "POST /api/jobs/[id]/interviews/reschedule",
  );
  if (parsed.errorResponse) return parsed.errorResponse;
  const body = parsed.body;
  const { slot_id, new_slot_id } = body;
  if (!slot_id || !new_slot_id) return jsonError("slot_id and new_slot_id are required", 400);
  if (slot_id === new_slot_id) return jsonError("new_slot_id must be different from slot_id", 400);

  const { data: oldSlot, error: oldErr } = await supabase
    .from("interview_availability_slots")
    .select("id, job_id, user_id, start_at, status, pipeline_candidate_id")
    .eq("id", slot_id)
    .eq("job_id", jobId)
    .single();

  if (oldErr || !oldSlot) return jsonError("Current slot not found", 404);
  if (oldSlot.status !== "booked" || !oldSlot.pipeline_candidate_id)
    return jsonError("Current slot is not booked", 409);

  const { data: newSlot, error: newErr } = await supabase
    .from("interview_availability_slots")
    .select("id, job_id, user_id, start_at, end_at, status")
    .eq("id", new_slot_id)
    .eq("job_id", jobId)
    .single();

  if (newErr || !newSlot) return jsonError("New slot not found", 404);
  if (newSlot.status !== "available") return jsonError("New slot is not available", 409);

  const pipeline_candidate_id = oldSlot.pipeline_candidate_id;
  let finalPipelineCandidateId = pipeline_candidate_id;
  let finalInterviewScheduledAt = newSlot.start_at;
  let usedAtomicRpc = false;

  const rpcClient = supabase as typeof supabase & {
    rpc?: (
      fn: string,
      args: { p_job_id: string; p_old_slot_id: string; p_new_slot_id: string },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  if (typeof rpcClient.rpc === "function") {
    const admin = createSupabaseAdmin();
    const { data: rpcData, error: rpcError } = await admin.rpc("th_reschedule_interview_slot", {
      p_job_id: jobId,
      p_old_slot_id: slot_id,
      p_new_slot_id: new_slot_id,
    });
    if (rpcError && !isMissingRpcFunction(rpcError)) {
      logger.error("Atomic reschedule RPC failed", { error: String(rpcError) });
      return jsonError("Failed to reschedule", 500);
    }
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const result = rpcData[0] as {
        success?: boolean;
        pipeline_candidate_id?: string | null;
        new_start_at?: string | null;
        error_code?: string | null;
      };
      if (result.success) {
        finalPipelineCandidateId = result.pipeline_candidate_id ?? pipeline_candidate_id;
        finalInterviewScheduledAt = result.new_start_at ?? newSlot.start_at;
        usedAtomicRpc = true;
      } else {
        if (
          result.error_code === "old_slot_not_booked" ||
          result.error_code === "new_slot_unavailable"
        ) {
          return jsonError("New slot is not available", 409);
        }
        return jsonError("Failed to reschedule", 500);
      }
    }
  }

  if (!usedAtomicRpc) {
    const { error: freeOldErr } = await supabase
      .from("interview_availability_slots")
      .update({ status: "available", pipeline_candidate_id: null })
      .eq("id", slot_id)
      .eq("job_id", jobId);

    if (freeOldErr) {
      logger.error("Failed to free old slot on reschedule", {
        error: String(freeOldErr),
      });
      return jsonError("Failed to reschedule", 500);
    }
    const { error: bookNewErr } = await supabase
      .from("interview_availability_slots")
      .update({ status: "booked", pipeline_candidate_id })
      .eq("id", new_slot_id)
      .eq("job_id", jobId);

    if (bookNewErr) {
      await supabase
        .from("interview_availability_slots")
        .update({ status: "booked", pipeline_candidate_id })
        .eq("id", slot_id)
        .eq("job_id", jobId)
        .eq("status", "available");
      logger.error("Failed to book new slot on reschedule", {
        error: String(bookNewErr),
      });
      return jsonError("Failed to reschedule", 500);
    }

    const { error: updatePcErr } = await supabase
      .from("pipeline_candidates")
      .update({
        interview_scheduled_at: newSlot.start_at,
        reminder_sent_at: null,
      })
      .eq("id", pipeline_candidate_id);

    if (updatePcErr) {
      await supabase
        .from("interview_availability_slots")
        .update({ status: "available", pipeline_candidate_id: null })
        .eq("id", new_slot_id)
        .eq("job_id", jobId)
        .eq("pipeline_candidate_id", pipeline_candidate_id);
      await supabase
        .from("interview_availability_slots")
        .update({ status: "booked", pipeline_candidate_id })
        .eq("id", slot_id)
        .eq("job_id", jobId)
        .eq("status", "available");
      logger.error("Failed to set interview_scheduled_at on reschedule", {
        error: String(updatePcErr),
      });
      return jsonError("Failed to reschedule", 500);
    }
  }

  // Move the calendar event: cancel the old one, book the new one with a fresh link.
  let meetingUrl: string | null = null;
  try {
    const adminCal = createSupabaseAdmin();
    await cancelBookedEvent(adminCal, slot_id, oldSlot.user_id ?? null);
    const { data: pcCal } = await adminCal
      .from("pipeline_candidates")
      .select("candidates(name, email)")
      .eq("id", finalPipelineCandidateId)
      .maybeSingle();
    const { data: jobCal } = await adminCal
      .from("jobs")
      .select("title")
      .eq("id", jobId)
      .maybeSingle();
    const cand = (pcCal?.candidates ?? null) as { name?: string; email?: string } | null;
    const synced = await syncBookedEvent(adminCal, {
      slotId: new_slot_id,
      jobTitle: (jobCal?.title as string | undefined) ?? "Interview",
      candidateName: cand?.name ?? null,
      candidateEmail: cand?.email ?? null,
      startAt: newSlot.start_at,
      endAt: newSlot.end_at,
    });
    meetingUrl = synced.meetingUrl;
  } catch (calErr) {
    logger.warn("calendar_reschedule_failed", { error: String(calErr) });
  }

  try {
    const { data: pcData } = await supabase
      .from("pipeline_candidates")
      .select("candidate_id, candidates(name, email, phone)")
      .eq("id", finalPipelineCandidateId)
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
    if (newSlot.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", newSlot.user_id)
        .maybeSingle();
      interviewerEmail = (profile?.email as string | undefined) ?? null;
      interviewerName = (profile?.full_name as string | undefined) ?? null;
      interviewerPhone = (profile?.phone as string | undefined) ?? null;
    }
    const jobTitle = jobData?.title ?? "your role";
    const candidateName = candidate?.name ?? "Candidate";

    await onInterviewTransition("booked", "rescheduled", {
      jobId,
      jobTitle,
      pipelineCandidateId: finalPipelineCandidateId,
      candidateId: (pcData?.candidate_id as string | undefined) ?? null,
      candidateName,
      candidateEmail: candidate?.email ?? null,
      candidatePhone: candidate?.phone ?? null,
      slotStartAt: newSlot.start_at,
      slotEndAt: newSlot.end_at,
      stageName: "Interview",
      interviewerEmail,
      interviewerName,
      interviewerPhone,
    });
  } catch (notifyErr) {
    logger.warn("Failed to send interview rescheduled notification", {
      error: String(notifyErr),
    });
  }

  return jsonSuccess(
    {
      slot_id: new_slot_id,
      pipeline_candidate_id: finalPipelineCandidateId,
      interview_scheduled_at: finalInterviewScheduledAt,
      meeting_url: meetingUrl,
    },
    200,
  );
}
