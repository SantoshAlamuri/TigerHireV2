import type { SupabaseClient } from "@supabase/supabase-js";
import { JobRepository, type JobListParams } from "@/lib/repositories/JobRepository";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FEATURE_FLAG_HYBRID_V2 } from "@/lib/fitscore/hybrid/constants";
import { ensureJdBaseForJob, getJdBaseByJobId } from "@/lib/fitscore/hybrid/jd-base";
import type { JobData } from "@/lib/fitscore/types";
import { isEnabled } from "@/lib/feature-flags";
import { inngest } from "@/inngest/client";

export const JobService = {
  async list(supabase: SupabaseClient, params: JobListParams) {
    const { jobs, total, nextCursor } = await JobRepository.list(supabase, params);
    return {
      jobs,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
        nextCursor,
      },
    };
  },

  async getById(supabase: SupabaseClient, id: string) {
    return JobRepository.getById(supabase, id);
  },

  async create(
    supabase: SupabaseClient,
    payload: Record<string, unknown>,
    userId: string,
    organisationId: string,
  ) {
    const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const job = await JobRepository.create(supabase, {
      ...payload,
      organisation_id: organisationId,
      created_by: userId,
      shortlist_due_at: dueAt.toISOString(),
    });
    logger.info("Job created", { job_id: job.id, user_id: userId });

    const admin = createSupabaseAdmin();
    const hybridEnabled = await isEnabled(FEATURE_FLAG_HYBRID_V2, organisationId);
    try {
      // The JD Base (ideal profile + context weights) is two sequential Claude calls —
      // measured at 22–24s on production for every publish, all of it inside this
      // request. When Inngest is configured, hand it to the existing jd-base/generate
      // function and respond now: nothing downstream needs the document at creation
      // time — scoring already gates on its *approval*, and the job page fetches (and
      // if necessary regenerates) it on demand. The synchronous path stays as the
      // fallback where no queue exists (local dev, tests), so behaviour there is
      // unchanged.
      if (process.env.INNGEST_EVENT_KEY) {
        await inngest.send({ name: "jd-base/generate", data: { jobId: job.id } });
        logger.info("JD Base generation enqueued", { job_id: job.id, async: true });
      } else {
        await ensureJdBaseForJob(admin, job as JobData);
        if (hybridEnabled) {
          const jdBase = await getJdBaseByJobId(admin, job.id);
          if (!jdBase) {
            throw new Error(
              "JD Base generation failed. Please retry job creation after fixing FitScore JD setup.",
            );
          }
        }
      }
    } catch (err) {
      logger.error("ensureJdBaseForJob failed during job create", {
        job_id: job.id,
        message: err instanceof Error ? err.message : String(err),
      });
      try {
        await JobRepository.remove(supabase, job.id);
      } catch (removeErr) {
        logger.error("Failed to rollback job after JD Base generation failure", {
          job_id: job.id,
          message: removeErr instanceof Error ? removeErr.message : String(removeErr),
        });
      }
      throw err;
    }

    if ((job as { status?: string }).status === "open") {
      void import("@/lib/whatsapp/job-alert")
        .then((m) => m.onJobPublished((job as { id: string }).id))
        .catch((e) => logger.warn("onJobPublished after create failed", { message: String(e) }));
    }

    return job;
  },

  async update(supabase: SupabaseClient, id: string, payload: Record<string, unknown>) {
    const previous = await JobRepository.getById(supabase, id);
    const updated = await JobRepository.update(supabase, id, payload);
    const wasOpen = previous.status === "open";
    const nowOpen = (updated as { status?: string }).status === "open";
    if (nowOpen && !wasOpen) {
      void import("@/lib/whatsapp/job-alert")
        .then((m) => m.onJobPublished(id))
        .catch((e) => logger.warn("onJobPublished after update failed", { message: String(e) }));
    }
    return updated;
  },

  async remove(supabase: SupabaseClient, id: string) {
    await JobRepository.remove(supabase, id);
    logger.info("Job deleted", { job_id: id });
  },

  async getActiveByCompany(supabase: SupabaseClient, organisationId: string) {
    return JobRepository.getActiveByCompany(supabase, organisationId);
  },
};
