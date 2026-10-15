import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateJobPreferences } from "./types";

export async function getCandidatePreferences(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<CandidateJobPreferences | null> {
  const { data } = await supabase
    .from("candidate_preferences")
    .select("preferences")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  const prefs = data?.preferences;
  if (!prefs || typeof prefs !== "object") return null;
  return prefs as CandidateJobPreferences;
}

/**
 * Upsert preferences for a candidate (service role only for WhatsApp-only candidates).
 */
export async function upsertCandidatePreferences(
  supabase: SupabaseClient,
  candidateId: string,
  preferences: CandidateJobPreferences,
): Promise<void> {
  const { error } = await supabase.from("candidate_preferences").upsert(
    {
      candidate_id: candidateId,
      preferences,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "candidate_id" },
  );

  if (error) throw new Error(`Failed to save preferences: ${error.message}`);
}
