import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { formatDisplayDateTime } from "@/lib/locale/display";
import { createNotification } from "@/lib/services/notifications";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { sendEmail } from "@/lib/services/resend";
import { interviewerFeedbackReminderHtml } from "@/lib/services/email-templates";
import { env } from "@/lib/config/env";
import { ensureIndustryFeedbackTemplateForJob } from "@/lib/feedback/industry-feedback-template";

const HOURS_MS = 60 * 60 * 1000;
const INTERVIEWER_NUDGE_AFTER_END_HOURS = 24;
const CANDIDATE_REMINDER_AFTER_SENT_HOURS = 48;
const CANDIDATE_NO_RESPONSE_AFTER_SENT_HOURS = 72;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeEmail(value?: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * 24h after scheduled end: nudge interviewer in-app (+ email) if feedback missing.
 */
export async function runInterviewerFeedbackOverdueNudges(
  admin: SupabaseClient,
): Promise<{ nudged: number; scanned: number }> {
  const cutoff = new Date(Date.now() - INTERVIEWER_NUDGE_AFTER_END_HOURS * HOURS_MS).toISOString();

  const { data: slots, error } = await admin
    .from("interview_availability_slots")
    .select(
      `
      id,
      end_at,
      start_at,
      pipeline_candidate_id,
      user_id,
      job_id,
      pipeline_candidates!inner (
        id,
        stage_id,
        interview_scheduled_at,
        candidates ( name, full_name, email ),
        jobs ( title, organisation_id, role_function )
      )
    `,
    )
    .eq("status", "booked")
    .not("pipeline_candidate_id", "is", null)
    .lte("end_at", cutoff)
    .order("end_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.error("Interviewer feedback nudge: slot query failed", { error: String(error) });
    return { nudged: 0, scanned: 0 };
  }

  let nudged = 0;
  const scanned = slots?.length ?? 0;

  for (const slot of slots ?? []) {
    const pc = unwrapOne(slot.pipeline_candidates as unknown as Record<string, unknown> | null) as {
      id: string;
      stage_id: string | null;
      candidates: { name: string | null; full_name: string | null } | null;
      jobs: {
        title: string | null;
        organisation_id: string | null;
        role_function: string | null;
      } | null;
    } | null;
    if (!pc?.id) continue;

    const { data: existingNudge } = await admin
      .from("interview_feedback_nudges")
      .select("id")
      .eq("pipeline_candidate_id", pc.id)
      .maybeSingle();
    if (existingNudge?.id) continue;

    const interviewerUserId = (slot.user_id as string | null) ?? null;
    if (!interviewerUserId) continue;

    const { count: feedbackCount } = await admin
      .from("feedback_responses")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_candidate_id", pc.id)
      .eq("submitted_by", interviewerUserId);

    if ((feedbackCount ?? 0) > 0) continue;

    const job = pc.jobs;
    const candidate = pc.candidates;
    const candidateName = (candidate?.full_name ?? candidate?.name ?? "Candidate").trim();

    let stageEmail: string | null = null;
    let stageName: string | null = null;
    let feedbackTemplateId: string | null = null;
    if (pc.stage_id) {
      const { data: stage } = await admin
        .from("pipeline_stages")
        .select("interviewer_email, interviewer_name, feedback_template_id")
        .eq("id", pc.stage_id)
        .maybeSingle();
      stageEmail = normalizeEmail(stage?.interviewer_email as string | null);
      stageName = (stage?.interviewer_name as string | null) ?? null;
      feedbackTemplateId = (stage?.feedback_template_id as string | null) ?? null;
    }

    const { data: interviewerProfile } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", interviewerUserId)
      .maybeSingle();

    const interviewAt = formatDisplayDateTime((slot.end_at as string) ?? (slot.start_at as string));

    let template = null;
    if (feedbackTemplateId) {
      const { data: t } = await admin
        .from("feedback_form_templates")
        .select("id, name, fields")
        .eq("id", feedbackTemplateId)
        .maybeSingle();
      if (t) {
        template = {
          id: t.id as string,
          name: t.name as string,
          fields: (t.fields as Array<{ label: string }>) ?? [],
        };
      }
    }
    if (!template && job?.organisation_id) {
      template = await ensureIndustryFeedbackTemplateForJob(admin, {
        jobId: slot.job_id as string,
        roleFunction: job.role_function,
        createdBy: null,
      });
    }
    if (!template) continue;

    const emailTo = stageEmail ?? normalizeEmail(interviewerProfile?.email as string | null);
    if (emailTo) {
      try {
        await sendEmail({
          to: emailTo,
          subject: `Feedback due: ${candidateName} (${job?.title ?? "Interview"})`,
          html: interviewerFeedbackReminderHtml({
            recipientName: (stageName ?? interviewerProfile?.full_name ?? "there") as string,
            candidateName,
            jobTitle: job?.title ?? "Interview",
            interviewAt,
            templateName: template.name,
            fields: template.fields,
            companyInterviewsUrl: `${env.baseUrl}/company/interviews`,
          }),
        });
      } catch (err) {
        logger.warn("Interviewer feedback nudge email failed", {
          pipelineCandidateId: pc.id,
          error: String(err),
        });
      }
    }

    await createNotification({
      userId: interviewerUserId,
      type: "application_update",
      title: `Submit interview feedback — ${candidateName}`,
      body: `Your feedback for ${job?.title ?? "the role"} is overdue. Open your interview queue to complete it.`,
      link: "/company/interviews",
      metadata: {
        source: "interview_feedback_overdue_nudge",
        jobId: slot.job_id as string,
        pipelineCandidateId: pc.id,
        slotId: slot.id as string,
      },
    });

    await admin.from("interview_feedback_nudges").insert({
      pipeline_candidate_id: pc.id,
      slot_id: slot.id,
      interviewer_user_id: interviewerUserId,
    });

    nudged += 1;
  }

  return { nudged, scanned };
}

/**
 * 48h: one WhatsApp reminder. 72h: mark no_response and notify recruiter.
 */
export async function runCandidateSlotPickerFollowups(
  admin: SupabaseClient,
): Promise<{ reminders: number; noResponse: number; scanned: number }> {
  const now = Date.now();
  const reminderCutoff = new Date(
    now - CANDIDATE_REMINDER_AFTER_SENT_HOURS * HOURS_MS,
  ).toISOString();
  const noResponseCutoff = new Date(
    now - CANDIDATE_NO_RESPONSE_AFTER_SENT_HOURS * HOURS_MS,
  ).toISOString();

  const { data: pending, error } = await admin
    .from("interview_slot_picker_requests")
    .select(
      `
      id,
      sent_at,
      reminder_sent_at,
      pipeline_candidate_id,
      job_id,
      organisation_id,
      initiated_by,
      slot_options,
      candidates ( phone, full_name, name ),
      jobs ( title, assigned_recruiter_id )
    `,
    )
    .eq("status", "pending")
    .limit(80);

  if (error) {
    logger.error("Slot picker follow-up query failed", { error: String(error) });
    return { reminders: 0, noResponse: 0, scanned: 0 };
  }

  let reminders = 0;
  let noResponse = 0;

  for (const row of pending ?? []) {
    const sentAt = row.sent_at as string;
    const phone = unwrapOne(
      row.candidates as { phone?: string | null } | Array<{ phone?: string | null }> | null,
    )?.phone;
    const job = unwrapOne(
      row.jobs as
        | { title: string | null; assigned_recruiter_id: string | null }
        | Array<{ title: string | null; assigned_recruiter_id: string | null }>,
    );
    const name =
      (
        unwrapOne(
          row.candidates as
            | { full_name?: string | null; name?: string | null }
            | Array<{ full_name?: string | null; name?: string | null }>,
        )?.full_name ??
        unwrapOne(
          row.candidates as
            | { full_name?: string | null; name?: string | null }
            | Array<{ full_name?: string | null; name?: string | null }>,
        )?.name
      )?.split(" ")[0] ?? "there";

    if (sentAt <= noResponseCutoff) {
      await admin
        .from("interview_slot_picker_requests")
        .update({
          status: "no_response",
          no_response_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      const recruiterId =
        (row.initiated_by as string | null) ?? (job?.assigned_recruiter_id as string | null);
      if (recruiterId) {
        await createNotification({
          userId: recruiterId,
          type: "application_update",
          title: "Candidate did not pick an interview slot",
          body: `${name} has not responded to the WhatsApp slot picker for ${job?.title ?? "a role"} (72h). Follow up manually.`,
          link: `/recruit/jobs/${row.job_id}/interviews`,
          metadata: {
            source: "slot_picker_no_response",
            jobId: row.job_id as string,
            pipelineCandidateId: row.pipeline_candidate_id as string,
          },
        });
      }
      noResponse += 1;
      continue;
    }

    if (sentAt <= reminderCutoff && !row.reminder_sent_at && phone) {
      const options = (row.slot_options as Array<{ label?: string }> | null) ?? [];
      const lines = options
        .slice(0, 5)
        .map((o, i) => `${i + 1}. ${o.label ?? "Slot"}`)
        .join("\n");
      const body =
        `Hi ${name}, gentle reminder to pick your interview time for ${job?.title ?? "the role"}:\n\n` +
        `${lines}\n\n` +
        `Reply with the slot number when ready.`;
      try {
        await sendWhatsAppMessage(phone, body);
        await admin
          .from("interview_slot_picker_requests")
          .update({
            reminder_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        reminders += 1;
      } catch (err) {
        logger.warn("Slot picker reminder failed", {
          id: row.id,
          error: String(err),
        });
      }
    }
  }

  return { reminders, noResponse, scanned: pending?.length ?? 0 };
}
