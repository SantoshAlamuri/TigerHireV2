import type { SupabaseClient } from "@supabase/supabase-js";

/** Most recent application id for a job+candidate, or null. */
export async function getApplicationId(
  admin: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}
