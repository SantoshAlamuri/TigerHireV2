/**
 * Job distribution engine: push jobs to external boards (Adzuna, Indeed) and remove when closed.
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { pushJobToAdzuna, deleteJobFromAdzuna } from "@/lib/distribution/connectors/adzuna";
import type { JobForDistribution } from "@/lib/distribution/connectors/adzuna";
import { pushJobToIndeed, deleteJobFromIndeed } from "@/lib/distribution/connectors/indeed";
import { validateJobPostingInput } from "@/lib/jobs/job-posting";
import { logger } from "@/lib/observability/logger";

const BOARD_ADZUNA = "adzuna";
const BOARD_INDEED = "indeed";

export interface DistributeResult {
  adzuna?: { success: boolean; externalId?: string; error?: string };
  indeed?: { success: boolean; externalId?: string; error?: string };
  /** Present (and non-empty) when the job failed pre-publish schema validation and was NOT pushed. */
  schemaErrors?: string[];
}

/**
 * Fetch job with organisation name and slug for distribution.
 */
async function getJobForDistribution(jobId: string): Promise<{
  job: JobForDistribution;
  organisationName: string;
  organisationSlug: string | null;
  organisationId: string | null;
  remoteAllowed: boolean | null;
  locationType: string | null;
} | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("jobs")
    .select(
      // location_type is on the hiring request, not on jobs. With it named here
      // the select failed outright, so distribution had no job to work from.
      "id, title, description, location, compensation_min, compensation_max, show_salary, jd_sections, remote_allowed, organisation_id, organisations!jobs_organisation_id_fkey(name, slug), hiring_requests!jobs_hiring_request_id_fkey(location_type)",
    )
    .eq("id", jobId)
    .single();

  if (error || !data) return null;

  const org = (data as { organisations?: { name?: string; slug?: string } | null }).organisations;
  const organisationName = (org && typeof org === "object" && "name" in org ? org.name : "") ?? "";
  const organisationSlug =
    (org && typeof org === "object" && "slug" in org ? org.slug : null) ?? null;
  const organisationId = (data as { organisation_id: string | null }).organisation_id ?? null;

  const job: JobForDistribution = {
    id: (data as { id: string }).id,
    title: (data as { title: string }).title,
    description: (data as { description: string | null }).description ?? null,
    location: (data as { location: string | null }).location ?? null,
    compensation_min: (data as { compensation_min: number | null }).compensation_min ?? null,
    compensation_max: (data as { compensation_max: number | null }).compensation_max ?? null,
    show_salary: (data as { show_salary: boolean | null }).show_salary ?? null,
    jd_sections: (data as { jd_sections: Record<string, unknown> | null }).jd_sections ?? null,
  };

  const remoteAllowed = (data as { remote_allowed: boolean | null }).remote_allowed ?? null;
  // Prefer the requisition's stated location type; fall back to the job's own
  // remote flag so a job raised without a requisition still classifies.
  const requisitionLocationType = (
    data as { hiring_requests?: { location_type?: string | null } | null }
  ).hiring_requests?.location_type;
  const locationType = requisitionLocationType ?? (remoteAllowed === true ? "remote" : null);

  return { job, organisationName, organisationSlug, organisationId, remoteAllowed, locationType };
}

/**
 * Distribute a job to configured boards (e.g. Adzuna, Indeed). Stores result in job_distributions.
 */
export async function distributeJob(jobId: string): Promise<DistributeResult> {
  const admin = createSupabaseAdmin();
  const payload = await getJobForDistribution(jobId);
  const result: DistributeResult = {};

  if (!payload) {
    logger.warn("Distribution skipped: job not found", { jobId });
    return result;
  }

  const { job, organisationName, organisationSlug, organisationId, remoteAllowed, locationType } =
    payload;

  // Pre-publish schema gate: a job that would be rejected by Google for Jobs (missing
  // description, no location for a non-remote role, etc.) is NOT pushed to external boards.
  // Recording the reason on job_distributions surfaces it in the distribution UI/logs.
  const jd = (job.jd_sections ?? {}) as {
    summary?: string;
    location?: string;
    employmentType?: string;
  };
  const validation = validateJobPostingInput({
    id: job.id,
    title: job.title,
    description: job.description ?? jd.summary ?? "",
    companyName: organisationName,
    employmentType: jd.employmentType ?? null,
    location: jd.location ?? job.location ?? null,
    locationType,
    remoteAllowed,
    showSalary: job.show_salary ?? false,
    compensationMin: job.compensation_min,
    compensationMax: job.compensation_max,
  });
  if (!validation.valid) {
    const message = `Invalid JobPosting schema: ${validation.errors.join(" ")}`;
    logger.warn("Distribution blocked: JobPosting schema invalid", {
      jobId,
      errors: validation.errors,
    });
    const now = new Date().toISOString();
    for (const board of [BOARD_ADZUNA, BOARD_INDEED]) {
      await admin.from("job_distributions").upsert(
        {
          job_id: jobId,
          board,
          external_id: null,
          status: "failed",
          error: message,
          pushed_at: now,
        },
        { onConflict: "job_id,board" },
      );
    }
    return { ...result, schemaErrors: validation.errors };
  }

  // Push to Adzuna
  try {
    const pushResult = await pushJobToAdzuna(
      job,
      organisationName,
      organisationSlug,
      organisationId,
    );
    result.adzuna = {
      success: pushResult.success,
      externalId: pushResult.externalId,
    };
    await admin.from("job_distributions").upsert(
      {
        job_id: jobId,
        board: BOARD_ADZUNA,
        external_id: pushResult.externalId ?? null,
        status: pushResult.success ? "pushed" : "failed",
        error: pushResult.success ? null : "Push returned success: false",
        pushed_at: new Date().toISOString(),
      },
      { onConflict: "job_id,board" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Adzuna push failed", { jobId, error: message });
    result.adzuna = { success: false, error: message };
    await admin.from("job_distributions").upsert(
      {
        job_id: jobId,
        board: BOARD_ADZUNA,
        external_id: null,
        status: "failed",
        error: message,
        pushed_at: new Date().toISOString(),
      },
      { onConflict: "job_id,board" },
    );
  }

  // Push to Indeed
  try {
    const pushResult = await pushJobToIndeed(
      job,
      organisationName,
      organisationSlug,
      organisationId,
    );
    result.indeed = {
      success: pushResult.success,
      externalId: pushResult.externalId,
    };
    await admin.from("job_distributions").upsert(
      {
        job_id: jobId,
        board: BOARD_INDEED,
        external_id: pushResult.externalId ?? null,
        status: pushResult.success ? "pushed" : "failed",
        error: pushResult.success ? null : "Push returned success: false",
        pushed_at: new Date().toISOString(),
      },
      { onConflict: "job_id,board" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Indeed push failed", { jobId, error: message });
    result.indeed = { success: false, error: message };
    await admin.from("job_distributions").upsert(
      {
        job_id: jobId,
        board: BOARD_INDEED,
        external_id: null,
        status: "failed",
        error: message,
        pushed_at: new Date().toISOString(),
      },
      { onConflict: "job_id,board" },
    );
  }

  return result;
}

/**
 * Remove a job from all boards it was pushed to. Updates job_distributions to status 'removed'.
 */
export async function removeJobFromBoards(jobId: string): Promise<void> {
  const admin = createSupabaseAdmin();

  const { data: rows, error } = await admin
    .from("job_distributions")
    .select("id, board, external_id")
    .eq("job_id", jobId)
    .eq("status", "pushed");

  if (error || !rows?.length) return;

  const now = new Date().toISOString();

  // Get organisation_id from job for tenant isolation
  const { data: jobData } = await admin
    .from("jobs")
    .select("organisation_id")
    .eq("id", jobId)
    .single();
  const organisationId =
    (jobData as { organisation_id: string | null } | null)?.organisation_id ?? null;

  for (const row of rows as Array<{ id: string; board: string; external_id: string | null }>) {
    if (row.board === BOARD_ADZUNA && row.external_id) {
      try {
        await deleteJobFromAdzuna(row.external_id, organisationId);
      } catch (err) {
        logger.error("Adzuna delete failed", {
          jobId,
          externalId: row.external_id,
          error: String(err),
        });
      }
    } else if (row.board === BOARD_INDEED && row.external_id) {
      try {
        await deleteJobFromIndeed(row.external_id, organisationId);
      } catch (err) {
        logger.error("Indeed delete failed", {
          jobId,
          externalId: row.external_id,
          error: String(err),
        });
      }
    }
    await admin
      .from("job_distributions")
      .update({ status: "removed", removed_at: now })
      .eq("id", row.id);
  }
}
