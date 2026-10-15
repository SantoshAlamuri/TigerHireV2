import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobData } from "@/lib/fitscore/types";
import type { UserRole } from "@/types";

type AuthLike = {
  role: UserRole;
};

/**
 * Load full job with admin after verifying the caller may see the job via RLS
 * (covers agency + multi-org; super_admin uses admin only).
 */
export async function loadJobForHybridPipeline(
  serverClient: SupabaseClient,
  admin: SupabaseClient,
  ctx: AuthLike,
  jobId: string,
): Promise<JobData | null> {
  if (ctx.role === "super_admin") {
    const { data: job, error } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (error || !job) return null;
    return job as JobData;
  }

  const { data: visible, error: visErr } = await serverClient
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .maybeSingle();
  if (visErr || !visible) return null;

  const { data: job, error } = await admin.from("jobs").select("*").eq("id", jobId).single();
  if (error || !job) return null;
  return job as JobData;
}
