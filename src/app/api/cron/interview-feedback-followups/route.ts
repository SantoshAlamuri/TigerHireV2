import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { ensureIndustryFeedbackTemplateForJob } from "@/lib/feedback/industry-feedback-template";
import { createNotification } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/services/resend";
import { interviewerFeedbackReminderHtml } from "@/lib/services/email-templates";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

type DueInterviewRow = {
  id: string;
  job_id: string;
  stage_id: string | null;
  interview_scheduled_at: string | null;
  jobs:
    | {
        title: string | null;
        organisation_id: string | null;
        role_function: string | null;
      }
    | Array<{
        title: string | null;
        organisation_id: string | null;
        role_function: string | null;
      }>
    | null;
  candidates:
    | { name: string | null; full_name: string | null; email: string | null }
    | Array<{ name: string | null; full_name: string | null; email: string | null }>
    | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeEmail(value?: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function GET(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: dueRowsRaw, error: dueError } = await admin
    .from("pipeline_candidates")
    .select(
      "id, job_id, stage_id, interview_scheduled_at, jobs(title, organisation_id, role_function), candidates(name, full_name, email)",
    )
    .not("stage_id", "is", null)
    .not("interview_scheduled_at", "is", null)
    .lte("interview_scheduled_at", nowIso)
    .eq("status", "in_progress")
    .order("interview_scheduled_at", { ascending: false })
    .limit(150);

  if (dueError) {
    logger.error("Failed to fetch due interviews for feedback follow-up", {
      error: String(dueError),
    });
    return NextResponse.json({ error: "Failed to fetch due interviews" }, { status: 500 });
  }

  const dueRows = (dueRowsRaw ?? []) as DueInterviewRow[];
  if (dueRows.length === 0) {
    return NextResponse.json({ remindersSent: 0, notificationsSent: 0, totalDue: 0 });
  }

  const pipelineCandidateIds = dueRows.map((row) => row.id);
  const stageIds = [...new Set(dueRows.map((row) => row.stage_id).filter(Boolean) as string[])];
  const orgIds = [
    ...new Set(
      dueRows
        .map((row) => unwrapOne(row.jobs)?.organisation_id)
        .filter((orgId): orgId is string => Boolean(orgId)),
    ),
  ];

  const { data: feedbackRows } = await admin
    .from("feedback_responses")
    .select("pipeline_candidate_id, submitted_by")
    .in("pipeline_candidate_id", pipelineCandidateIds);

  const submittedByCandidate = new Map<string, Set<string>>();
  for (const row of feedbackRows ?? []) {
    const candidateId = row.pipeline_candidate_id as string;
    const submittedBy = row.submitted_by as string;
    if (!submittedByCandidate.has(candidateId)) submittedByCandidate.set(candidateId, new Set());
    submittedByCandidate.get(candidateId)?.add(submittedBy);
  }

  const { data: stageRows } = stageIds.length
    ? await admin
        .from("pipeline_stages")
        .select("id, interviewer_email, interviewer_name, feedback_template_id")
        .in("id", stageIds)
    : {
        data: [] as Array<{
          id: string;
          interviewer_email: string | null;
          interviewer_name: string | null;
          feedback_template_id: string | null;
        }>,
      };

  const stageById = new Map(
    (stageRows ?? []).map((stage) => [
      stage.id as string,
      {
        interviewerEmail: normalizeEmail(stage.interviewer_email as string | null),
        interviewerName: (stage.interviewer_name as string | null) ?? null,
        feedbackTemplateId: (stage.feedback_template_id as string | null) ?? null,
      },
    ]),
  );

  const stageTemplateIds = [
    ...new Set(
      (stageRows ?? [])
        .map((stage) => stage.feedback_template_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: stageTemplateRows } = stageTemplateIds.length
    ? await admin
        .from("feedback_form_templates")
        .select("id, name, fields")
        .in("id", stageTemplateIds)
    : { data: [] as Array<{ id: string; name: string; fields: Array<{ label: string }> }> };
  const templateById = new Map(
    (stageTemplateRows ?? []).map((template) => [
      template.id as string,
      {
        id: template.id as string,
        name: template.name as string,
        fields:
          (template.fields as Array<{ label: string; required?: boolean; description?: string }>) ??
          [],
      },
    ]),
  );

  const stageEmails = [
    ...new Set(
      (stageRows ?? [])
        .map((row) => normalizeEmail(row.interviewer_email))
        .filter(Boolean) as string[],
    ),
  ];
  const { data: interviewerProfiles } = stageEmails.length
    ? await admin
        .from("profiles")
        .select("id, organisation_id, email, full_name")
        .in("organisation_id", orgIds.length ? orgIds : ["__none__"])
        .in("email", stageEmails)
    : {
        data: [] as Array<{
          id: string;
          organisation_id: string;
          email: string;
          full_name: string | null;
        }>,
      };

  const interviewerByOrgEmail = new Map<string, { id: string; fullName: string | null }>();
  for (const profile of interviewerProfiles ?? []) {
    const key = `${profile.organisation_id}:${normalizeEmail(profile.email)}`;
    interviewerByOrgEmail.set(key, {
      id: profile.id as string,
      fullName: (profile.full_name as string | null) ?? null,
    });
  }

  const interviewerIds = [
    ...new Set((interviewerProfiles ?? []).map((profile) => profile.id as string)),
  ];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNotifications } = interviewerIds.length
    ? await admin
        .from("notifications")
        .select("user_id, metadata")
        .in("user_id", interviewerIds)
        .eq("type", "application_update")
        .gte("created_at", sevenDaysAgo)
    : { data: [] as Array<{ user_id: string; metadata: Record<string, unknown> | null }> };

  const alreadyNotified = new Set<string>();
  for (const notification of recentNotifications ?? []) {
    const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
    if (metadata.source !== "interview_feedback_request") continue;
    const pipelineCandidateId = String(metadata.pipelineCandidateId ?? "");
    if (!pipelineCandidateId) continue;
    alreadyNotified.add(`${notification.user_id}:${pipelineCandidateId}`);
  }

  let remindersSent = 0;
  let notificationsSent = 0;

  for (const row of dueRows) {
    const stageId = row.stage_id;
    if (!stageId) continue;

    const stage = stageById.get(stageId);
    if (!stage?.interviewerEmail) continue;

    const job = unwrapOne(row.jobs);
    if (!job?.organisation_id) continue;

    const interviewerProfile = interviewerByOrgEmail.get(
      `${job.organisation_id}:${stage.interviewerEmail}`,
    );

    if (interviewerProfile?.id && submittedByCandidate.get(row.id)?.has(interviewerProfile.id)) {
      continue;
    }

    const dedupeKey = interviewerProfile?.id ? `${interviewerProfile.id}:${row.id}` : null;
    if (dedupeKey && alreadyNotified.has(dedupeKey)) {
      continue;
    }

    const stageTemplate = stage.feedbackTemplateId
      ? templateById.get(stage.feedbackTemplateId)
      : null;
    const template =
      stageTemplate ??
      (await ensureIndustryFeedbackTemplateForJob(admin, {
        jobId: row.job_id,
        roleFunction: job.role_function,
        createdBy: null,
      }));

    if (!template) continue;

    const candidate = unwrapOne(row.candidates);
    const candidateName = (candidate?.full_name ?? candidate?.name ?? "Candidate").trim();
    const interviewAt = row.interview_scheduled_at
      ? new Date(row.interview_scheduled_at).toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "completed interview";
    try {
      await sendEmail({
        to: stage.interviewerEmail,
        subject: `Feedback required: ${candidateName} (${job.title ?? "Interview"})`,
        html: interviewerFeedbackReminderHtml({
          recipientName: (stage.interviewerName ??
            interviewerProfile?.fullName ??
            "there") as string,
          candidateName,
          jobTitle: job.title ?? "Interview",
          interviewAt,
          templateName: template.name,
          fields: template.fields,
          companyInterviewsUrl: `${env.baseUrl}/company/interviews`,
        }),
      });
      remindersSent += 1;
    } catch (err) {
      logger.warn("Failed to send interviewer feedback reminder email", {
        pipelineCandidateId: row.id,
        error: String(err),
      });
    }

    if (interviewerProfile?.id) {
      const ok = await createNotification({
        userId: interviewerProfile.id,
        type: "application_update",
        title: `Feedback pending for ${candidateName}`,
        body: `Submit ${template.name} to help recruiter move the candidate to the next stage.`,
        link: `/company/interviews`,
        metadata: {
          source: "interview_feedback_request",
          jobId: row.job_id,
          pipelineCandidateId: row.id,
          templateId: template.id,
        },
      });
      if (ok) {
        notificationsSent += 1;
        if (dedupeKey) alreadyNotified.add(dedupeKey);
      }
    }
  }

  return NextResponse.json({
    remindersSent,
    notificationsSent,
    totalDue: dueRows.length,
  });
}
