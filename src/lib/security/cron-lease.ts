import { randomUUID } from "crypto";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_CRON_LEASE_TTL_SECONDS = 15 * 60;

function buildLeaseOwner(jobName: string): string {
  const region = process.env.VERCEL_REGION ?? "local";
  const pid = typeof process !== "undefined" ? process.pid : 0;
  return `${jobName}:${region}:${pid}:${randomUUID()}`;
}

export async function acquireCronLease(
  jobName: string,
  ttlSeconds = DEFAULT_CRON_LEASE_TTL_SECONDS,
): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const leaseOwner = buildLeaseOwner(jobName);
  const { data, error } = await admin.rpc("acquire_cron_lease", {
    p_job_name: jobName,
    p_lease_owner: leaseOwner,
    p_ttl_seconds: ttlSeconds,
  });

  if (error) {
    logger.error("Cron lease acquire failed", {
      jobName,
      error: error.message,
      code: error.code,
    });
    throw error;
  }

  return data === true ? leaseOwner : null;
}

export async function releaseCronLease(jobName: string, leaseOwner: string): Promise<void> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("release_cron_lease", {
    p_job_name: jobName,
    p_lease_owner: leaseOwner,
  });

  if (error) {
    logger.warn("Cron lease release failed", {
      jobName,
      leaseOwner,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (data !== true) {
    logger.warn("Cron lease release skipped (owner mismatch or already released)", {
      jobName,
      leaseOwner,
    });
  }
}
