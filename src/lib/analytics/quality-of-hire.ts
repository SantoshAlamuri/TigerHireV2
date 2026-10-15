/**
 * Quality-of-Hire analytics readers. Backed by the views:
 *   quality_of_hire_by_job, post_hire_pulse_by_job, fitscore_predictive_validity
 * (migration 20260720120000). These read data captured in hiring_outcomes +
 * post_hire_pulse_responses that previously had no report surface.
 *
 * post_hire_pulse_responses is service-role-only RLS, so callers pass the admin client
 * and MUST scope by organisationId here (same pattern as the other analytics readers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface QualityByJobRow {
  job_id: string;
  job_title: string | null;
  hires_count: number;
  avg_performance_rating: number | null;
  rated_count: number;
  retained_6m_count: number;
  retention_6m_known: number;
  retained_12m_count: number;
  retention_12m_known: number;
  avg_hire_fitscore: number | null;
}

export interface PulseByJobRow {
  job_id: string;
  job_title: string | null;
  pulses_tracked: number;
  pulses_responded: number;
  left_count: number;
  avg_pulse_score: number | null;
}

export interface PredictiveValidityRow {
  fitscore_band: string;
  hires: number;
  avg_performance_rating: number | null;
  retention_6m_rate: number | null;
}

export interface QualityOfHireResult {
  qualityByJob: QualityByJobRow[];
  pulseByJob: PulseByJobRow[];
  predictiveValidity: PredictiveValidityRow[];
}

const BAND_ORDER: Record<string, number> = { "80-100": 0, "70-79": 1, "50-69": 2, "0-49": 3 };

export async function getQualityOfHire(
  admin: SupabaseClient,
  organisationId: string,
  opts?: { jobIds?: string[] | null; includePredictiveValidity?: boolean },
): Promise<QualityOfHireResult> {
  const jobIds = opts?.jobIds ?? null;
  const includeValidity = opts?.includePredictiveValidity ?? true;

  let qohQuery = admin
    .from("quality_of_hire_by_job")
    .select("*")
    .eq("organisation_id", organisationId);
  let pulseQuery = admin
    .from("post_hire_pulse_by_job")
    .select("*")
    .eq("organisation_id", organisationId);
  if (jobIds) {
    // Empty scope → no rows (avoids returning the whole org for a scoped manager).
    if (jobIds.length === 0) {
      return { qualityByJob: [], pulseByJob: [], predictiveValidity: [] };
    }
    qohQuery = qohQuery.in("job_id", jobIds);
    pulseQuery = pulseQuery.in("job_id", jobIds);
  }

  const [qohRes, pulseRes, validityRes] = await Promise.all([
    qohQuery,
    pulseQuery,
    includeValidity
      ? admin.from("fitscore_predictive_validity").select("*").eq("organisation_id", organisationId)
      : Promise.resolve({ data: [] as PredictiveValidityRow[], error: null }),
  ]);

  if (qohRes.error) throw qohRes.error;
  if (pulseRes.error) throw pulseRes.error;
  if ("error" in validityRes && validityRes.error) throw validityRes.error;

  const predictiveValidity = ((validityRes.data as PredictiveValidityRow[]) ?? []).sort(
    (a, b) => (BAND_ORDER[a.fitscore_band] ?? 9) - (BAND_ORDER[b.fitscore_band] ?? 9),
  );

  return {
    qualityByJob: (qohRes.data as QualityByJobRow[]) ?? [],
    pulseByJob: (pulseRes.data as PulseByJobRow[]) ?? [],
    predictiveValidity,
  };
}
