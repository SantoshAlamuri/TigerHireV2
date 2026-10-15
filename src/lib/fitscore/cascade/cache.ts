import type { SupabaseClient } from "@supabase/supabase-js";

export type RerankCacheEntry = {
  jobId: string;
  jdBaseVersion: number;
  topSet: { candidateId: string; rank: number }[];
  computedAt: string;
};

export async function getRerankCache(
  admin: SupabaseClient,
  jobId: string,
  jdBaseVersion: number,
): Promise<RerankCacheEntry | null> {
  const { data, error } = await admin
    .from("rerank_cache")
    .select("job_id, jd_base_version, top_set, computed_at")
    .eq("job_id", jobId)
    .eq("jd_base_version", jdBaseVersion)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const topSet = Array.isArray(data.top_set) ? (data.top_set as RerankCacheEntry["topSet"]) : [];
  return {
    jobId: data.job_id,
    jdBaseVersion: data.jd_base_version,
    topSet,
    computedAt: data.computed_at,
  };
}

export async function upsertRerankCache(
  admin: SupabaseClient,
  entry: Omit<RerankCacheEntry, "computedAt">,
): Promise<void> {
  const { error } = await admin.from("rerank_cache").upsert(
    {
      job_id: entry.jobId,
      jd_base_version: entry.jdBaseVersion,
      top_set: entry.topSet,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "job_id,jd_base_version" },
  );
  if (error) throw error;
}
