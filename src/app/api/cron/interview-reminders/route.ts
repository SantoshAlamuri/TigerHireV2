import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";
import { onInterviewTransition } from "@/lib/interviews/notifier";

/**
 * GET /api/cron/interview-reminders
 *
 * Cron job that sends reminder emails for interviews scheduled within the next 24 hours.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 * Idempotent — tracks sent reminders via reminder_sent_at column.
 */
export async function GET(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Fetch booked slots in the next 24 hours that haven't had a reminder sent
  const { data: slots, error: slotsError } = await admin
    .from("interview_availability_slots")
    .select(
      `
      id,
      start_at,
      user_id,
      pipeline_candidate_id,
      pipeline_candidates!inner (
        id,
        job_id,
        candidate_id,
        candidates!inner (
          name,
          email,
          phone
        )
      ),
      jobs:job_id (
        title
      )
    `,
    )
    .eq("status", "booked")
    .is("reminder_sent_at", null)
    .gte("start_at", now.toISOString())
    .lte("start_at", in24Hours.toISOString());

  if (slotsError) {
    logger.error("Failed to fetch interview slots for reminders", {
      error: String(slotsError),
    });
    return NextResponse.json({ error: "Failed to fetch slots" }, { status: 500 });
  }

  if (!slots || slots.length === 0) {
    return NextResponse.json({ sent: 0, message: "No upcoming interviews" });
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const slot of slots) {
    const pipelineCandidate = slot.pipeline_candidates as unknown as {
      id: string;
      job_id: string;
      candidate_id: string;
      candidates: { name: string | null; email: string | null; phone: string | null };
    };
    const job = slot.jobs as unknown as { title: string } | null;
    const candidate = pipelineCandidate?.candidates;
    const jobTitle = job?.title ?? "Interview";

    let interviewerEmail: string | null = null;
    let interviewerName: string | null = null;
    let interviewerPhone: string | null = null;
    if (slot.user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", slot.user_id)
        .single();
      interviewerEmail = profile?.email ?? null;
      interviewerName = profile?.full_name ?? null;
      interviewerPhone = profile?.phone ?? null;
    }

    try {
      await onInterviewTransition("booked", "reminded", {
        jobId: pipelineCandidate?.job_id,
        jobTitle,
        pipelineCandidateId: pipelineCandidate?.id,
        candidateId: pipelineCandidate?.candidate_id,
        candidateName: candidate?.name ?? "Candidate",
        candidateEmail: candidate?.email ?? null,
        candidatePhone: candidate?.phone ?? null,
        interviewerName,
        interviewerEmail,
        interviewerPhone,
        slotStartAt: slot.start_at,
      });
      if (candidate?.email) sentCount++;
      if (interviewerEmail) sentCount++;
    } catch (err) {
      const msg = `Failed reminder transition for slot ${slot.id}: ${String(err)}`;
      logger.error(msg);
      errors.push(msg);
    }

    // Mark reminder as sent (even if one of the emails failed, to avoid spamming)
    const { error: updateError } = await admin
      .from("interview_availability_slots")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", slot.id);

    if (updateError) {
      logger.error("Failed to mark reminder as sent", {
        slotId: slot.id,
        error: String(updateError),
      });
    }
  }

  logger.info("Interview reminders cron completed", {
    totalSlots: slots.length,
    emailsSent: sentCount,
    errors: errors.length,
  });

  return NextResponse.json({
    sent: sentCount,
    slotsProcessed: slots.length,
    errors: errors.length,
  });
}
