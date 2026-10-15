import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { seedPipelineStagesForNewJob } from "@/lib/pipeline/job-pipeline-seed";
import {
  findBestIndiaTemplate,
  generateJdBaseDocument,
  getJdBaseByJobId,
  upsertJdBaseFromTemplate,
  type JdBaseWriteOptions,
} from "@/lib/fitscore/hybrid";
import { getFitscoreHybridHaikuModel } from "@/lib/config/models";
import type { JobData } from "@/lib/fitscore/types";
import { buildJdText } from "@/lib/fitscore/job-text";
import { logger } from "@/lib/observability/logger";
import { inferTitleFromJdText, serializeTryoutJdBase } from "@/lib/tryout/serialize";
import { getTryoutOrgId } from "@/lib/tryout/auth";

/** JD-tailored ideal profile via fast Haiku; skip feedback sync on demo path. */
const TRYOUT_JD_BASE_OPTIONS: JdBaseWriteOptions = {
  idealProfileSource: "llm",
  idealProfileModel: getFitscoreHybridHaikuModel(),
  syncFeedbackTemplate: false,
  generationModel: getFitscoreHybridHaikuModel(),
  generationMaxTokens: 1536,
};

export async function createTryoutJobWithJdBase(params: {
  jdText: string;
  title?: string;
  userId: string;
}) {
  const orgId = getTryoutOrgId();
  if (!orgId) throw new Error("TRYOUT_ORG_ID not configured");

  const title = params.title?.trim() || inferTitleFromJdText(params.jdText);
  const description = params.jdText.trim();
  if (description.length < 50) {
    throw new Error("Job description must be at least 50 characters.");
  }

  const admin = createSupabaseAdmin();
  const startedAt = Date.now();
  const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const jobRow = await JobRepository.create(admin, {
    title,
    description,
    location: null,
    status: "open",
    organisation_id: orgId,
    created_by: params.userId,
    shortlist_due_at: dueAt.toISOString(),
    list_on_public_job_board: false,
    list_for_internal_referrals: true,
  });

  // Pipeline stages are only needed before CV upload — seed in background to keep JD analysis fast.
  void seedPipelineStagesForNewJob(admin, orgId, jobRow.id as string).catch((err) => {
    logger.warn("tryout: pipeline seed failed (non-blocking)", {
      job_id: jobRow.id,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  const job: JobData = {
    id: jobRow.id as string,
    title: String(jobRow.title ?? title),
    description: String(jobRow.description ?? description),
    location: null,
    status: "open",
    compensation_min: null,
    compensation_max: null,
    organisation_id: orgId,
  };

  const jdBlob = `${job.title}\n${buildJdText(job)}`;
  const match = findBestIndiaTemplate(jdBlob);
  const doc = match
    ? await upsertJdBaseFromTemplate(admin, job, match.template, TRYOUT_JD_BASE_OPTIONS)
    : await generateJdBaseDocument(admin, job, TRYOUT_JD_BASE_OPTIONS);

  logger.info("tryout: jd base created", {
    job_id: job.id,
    template_id: match?.template.id ?? null,
    duration_ms: Date.now() - startedAt,
  });

  return {
    job,
    jdBase: doc,
    payload: serializeTryoutJdBase(doc, job),
  };
}

export async function countTryoutApplications(
  admin: SupabaseClient,
  jobId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("source", "tryout");
  if (error) throw error;
  return count ?? 0;
}

export async function loadTryoutJob(admin: SupabaseClient, jobId: string, orgId: string) {
  const { data: job } = await admin
    .from("jobs")
    .select(
      "id, title, description, location, status, compensation_min, compensation_max, organisation_id",
    )
    .eq("id", jobId)
    .eq("organisation_id", orgId)
    .maybeSingle();
  if (!job) return null;
  return job as JobData;
}

export async function getTryoutJdBasePayload(jobId: string, orgId: string) {
  const admin = createSupabaseAdmin();
  const job = await loadTryoutJob(admin, jobId, orgId);
  if (!job) return null;
  const doc = await getJdBaseByJobId(admin, jobId);
  return serializeTryoutJdBase(doc, job);
}
