/**
 * Candidate job preferences for showing relevant opportunities.
 * Stored in candidate_preferences.preferences (jsonb).
 */
export interface CandidateJobPreferences {
  /** Preferred cities/regions (e.g. ["Bangalore", "Remote"]) */
  preferred_locations?: string[];
  /** remote = only remote, hybrid = remote ok, onsite = office only, any = no filter */
  remote_preference?: "remote" | "hybrid" | "onsite" | "any";
  /** Preferred seniority (e.g. ["Senior", "Lead"]) */
  preferred_seniority?: string[];
  /** Preferred role functions (e.g. ["Engineering", "Product"]) — matches job.role_function */
  preferred_role_functions?: string[];
  /** Min salary in LPA (e.g. 15) */
  salary_min_lpa?: number | null;
  /** Max salary in LPA (e.g. 25). Overlap with job range = match. */
  salary_max_lpa?: number | null;
  /** WhatsApp Lane B Q&A raw answers (merged into filters where possible). */
  whatsapp_qa?: {
    role_family?: string;
    location_raw?: string;
    experience_raw?: string;
    salary_lpa_raw?: string;
    notice_period_days?: number | null;
  };
}

export function hasPreferences(prefs: CandidateJobPreferences | null): boolean {
  if (!prefs) return false;
  const qa = prefs.whatsapp_qa;
  const qaText =
    (qa?.role_family?.trim() ?? "") ||
    (qa?.location_raw?.trim() ?? "") ||
    (qa?.experience_raw?.trim() ?? "") ||
    (qa?.salary_lpa_raw?.trim() ?? "") ||
    qa?.notice_period_days != null;
  return (
    (prefs.preferred_locations?.length ?? 0) > 0 ||
    (prefs.remote_preference != null && prefs.remote_preference !== "any") ||
    (prefs.preferred_seniority?.length ?? 0) > 0 ||
    (prefs.preferred_role_functions?.length ?? 0) > 0 ||
    (prefs.salary_min_lpa != null && prefs.salary_min_lpa > 0) ||
    (prefs.salary_max_lpa != null && prefs.salary_max_lpa > 0) ||
    Boolean(qaText)
  );
}
