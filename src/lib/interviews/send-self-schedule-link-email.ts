import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { selfScheduleInviteEmailHtml } from "@/lib/services/email-templates";
import { sendEmail } from "@/lib/services/resend";
import { logger } from "@/lib/observability/logger";

export async function sendSelfScheduleLinkEmail(params: {
  admin: SupabaseClient;
  jobId: string;
  pipelineCandidateId: string;
  scheduleUrl: string;
  expiresAt: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const { data: row, error } = await params.admin
    .from("pipeline_candidates")
    .select("id, candidates ( name, email ), jobs ( title, organisations ( name ) )")
    .eq("id", params.pipelineCandidateId)
    .eq("job_id", params.jobId)
    .single();

  if (error || !row) {
    return { sent: false, reason: "Pipeline candidate not found" };
  }

  const candidate = row.candidates as { name?: string | null; email?: string | null } | null;
  const email = candidate?.email?.trim();
  if (!email) {
    return { sent: false, reason: "Candidate has no email on file" };
  }

  const job = row.jobs as
    | {
        title?: string | null;
        organisations?: { name?: string | null } | { name?: string | null }[] | null;
      }
    | null
    | undefined;
  const jobTitle = job?.title?.trim() || "your role";
  const orgs = job?.organisations;
  const companyName = Array.isArray(orgs)
    ? (orgs[0]?.name ?? "the hiring team")
    : (orgs?.name ?? "the hiring team");

  const expiresLabel = new Date(params.expiresAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = `Pick your interview time — ${jobTitle}`;
  const html = selfScheduleInviteEmailHtml({
    recipientName: candidate?.name?.trim() || "there",
    jobTitle,
    companyName,
    scheduleUrl: params.scheduleUrl,
    expiresLabel,
  });

  const result = await sendEmail({ to: email, subject, html });
  if (result.error) {
    logger.warn("self-schedule invite email failed", {
      jobId: params.jobId,
      pipelineCandidateId: params.pipelineCandidateId,
      error: String(result.error),
    });
    return { sent: false, reason: "Email could not be sent" };
  }

  if (!env.outboundNotificationsEnabled && env.isProductionOutboundHold) {
    return {
      sent: true,
      reason:
        "Email logged only (production outbound hold). Set OUTBOUND_NOTIFICATIONS_ENABLED=true to deliver.",
    };
  }

  return { sent: true };
}
