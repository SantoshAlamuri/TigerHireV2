import type { SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { generateJobFromPrompt } from "@/lib/services/anthropic";
import { JobService } from "@/lib/services/JobService";
import { extractSkillsFromSections, toDynamicJdSections } from "@/lib/jobs/normalize-sections";
import { buildDescriptionFromDynamic } from "@/lib/jobs/build-description";
import { createNotification } from "@/lib/services/notifications";
import { invalidateJobCache } from "@/lib/redis/job-cache";
import { enqueue } from "@/lib/jobs/queue";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { logger } from "@/lib/observability/logger";

export interface GenerateJdResult {
  status: "created" | "skipped";
  jobId?: string;
  reason?: string;
}

/**
 * Auto-generate a draft JD (and Job) from an approved hiring request.
 *
 * This is intentionally decoupled from the approval HTTP request: the Claude
 * call that writes the JD can take several seconds, so it runs in the background
 * (Inngest) after the requisition is marked `approved`. On success the requisition
 * is flipped to `converted` and linked to the new job.
 *
 * Idempotent: if the requisition already has an assigned job it is a no-op, so
 * Inngest retries never create duplicate jobs.
 */
export async function generateJdForApprovedRequisition(
  admin: SupabaseClient,
  params: { hiringRequestId: string; actorProfileId: string },
): Promise<GenerateJdResult> {
  const { hiringRequestId, actorProfileId } = params;

  const { data: existing, error } = await admin
    .from("hiring_requests")
    .select("*")
    .eq("id", hiringRequestId)
    .single();

  if (error || !existing) {
    throw new Error(`Hiring request not found: ${hiringRequestId}`);
  }

  if (existing.assigned_job_id) {
    logger.info("generateJdForApprovedRequisition skipped; job already assigned", {
      hiring_request_id: hiringRequestId,
      job_id: existing.assigned_job_id,
    });
    return { status: "skipped", reason: "already_assigned" };
  }

  const promptParts: string[] = [];
  promptParts.push(`Role: ${existing.title}`);
  if (existing.department) promptParts.push(`Department: ${existing.department}`);
  if (existing.headcount > 1) promptParts.push(`Headcount: ${existing.headcount} positions`);
  if (existing.urgency && existing.urgency !== "normal")
    promptParts.push(`Urgency: ${existing.urgency}`);
  if (existing.description) promptParts.push(`Details: ${existing.description}`);
  // Structured ideal-candidate profile → flows into the JD and the fit-scoring ICP.
  const mustHaves = existing.must_haves as string | null;
  const niceToHaves = existing.nice_to_haves as string | null;
  const idealExperience = existing.ideal_experience as string | null;
  const idealSummary = existing.ideal_summary as string | null;
  if (mustHaves) promptParts.push(`Must-have requirements: ${mustHaves}`);
  if (niceToHaves) promptParts.push(`Nice-to-have requirements: ${niceToHaves}`);
  if (idealExperience) promptParts.push(`Target experience: ${idealExperience}`);
  if (idealSummary) promptParts.push(`Ideal candidate profile: ${idealSummary}`);
  if (existing.notes) promptParts.push(`Additional notes from hiring manager: ${existing.notes}`);
  const prompt = promptParts.join(". ") + ".";

  logger.info("Auto-generating JD from hiring request (background)", {
    hiring_request_id: hiringRequestId,
  });
  const generated = await generateJobFromPrompt(prompt);

  const salaryMinRupees =
    generated.salaryMin != null ? Math.round(generated.salaryMin * 100_000) : null;
  const salaryMaxRupees =
    generated.salaryMax != null ? Math.round(generated.salaryMax * 100_000) : null;

  const sections = (generated.sections ?? []).map((s) => ({ ...s, id: nanoid(8) }));
  const description = buildDescriptionFromDynamic(sections) || generated.description;
  const skills = extractSkillsFromSections(sections);

  const organisationId = existing.organisation_id as string;
  const job = await JobService.create(
    admin,
    {
      title: generated.titleNormalised,
      description,
      location: generated.location || null,
      status: "draft",
      compensation_min: salaryMinRupees,
      compensation_max: salaryMaxRupees,
      role_function: generated.roleFunction || null,
      seniority_level: generated.seniorityLevel || null,
      skills_required: skills.required,
      skills_preferred: skills.preferred,
      remote_allowed: generated.remoteAllowed ?? false,
      jd_sections: toDynamicJdSections(sections),
      hiring_request_id: hiringRequestId,
    },
    actorProfileId,
    organisationId,
  );

  const { error: updateErr } = await admin
    .from("hiring_requests")
    .update({ assigned_job_id: job.id, status: "converted" })
    .eq("id", hiringRequestId)
    .is("assigned_job_id", null);
  if (updateErr) {
    logger.error("Failed to link auto-generated job to hiring request", {
      hiring_request_id: hiringRequestId,
      job_id: job.id,
      error: String(updateErr),
    });
    throw updateErr;
  }

  // Keep the reverse link + cache consistent, mirroring the inline PATCH path.
  const { error: linkErr } = await admin
    .from("jobs")
    .update({ hiring_request_id: hiringRequestId })
    .eq("id", job.id);
  if (linkErr) {
    logger.warn("Could not set hiring_request_id on auto-generated job", {
      job_id: job.id,
      error: String(linkErr),
    });
  }
  await invalidateJobCache(job.id, organisationId);

  logger.info("Auto-generated JD from hiring request (background)", {
    hiring_request_id: hiringRequestId,
    job_id: job.id,
  });

  // Mirror the audit trail the inline path used to write when the JD was created.
  await recordHiringOfferAuditEvent({
    organisationId,
    entityType: "hiring_request",
    entityId: hiringRequestId,
    eventType: "HIRING_REQUEST_JD_CREATED",
    actorProfileId,
    actorRole: null,
    prevStatus: "approved",
    newStatus: "converted",
    channel: "system",
    metadata: { job_id: job.id },
  });

  // Let the hiring manager know the draft JD is ready.
  await createNotification({
    userId: existing.created_by as string,
    type: "hiring_request_new",
    title: `Hiring request "${existing.title}" approved — draft JD created`,
    body: `Your hiring request has been approved and a draft JD "${generated.titleNormalised}" has been auto-generated. The recruiter will review and publish it shortly.`,
    link: "/recruit/jobs",
  });

  // Awaited, not fire-and-forget: this runs inside the approval call, and an
  // unawaited send can die when the serverless instance freezes — leaving an
  // approved role that never reaches the job boards.
  await enqueue("job-distribute", { jobId: job.id });

  return { status: "created", jobId: job.id };
}
