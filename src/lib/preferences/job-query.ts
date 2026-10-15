import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateJobPreferences } from "./types";
import { hasPreferences } from "./types";

/** Job compensation in DB is in rupees (pa). 1 LPA = 100_000 rupees. */
const LPA_TO_RUPEES = 100_000;

/**
 * Build open-jobs query with preference filters applied when present.
 * Caller still must .order().limit().
 */
export function applyPreferencesToJobsQuery(
  supabase: SupabaseClient,
  preferences: CandidateJobPreferences | null,
) {
  let query = supabase.from("jobs").select("*").eq("status", "open");

  if (!preferences || !hasPreferences(preferences)) {
    return query;
  }

  if (
    preferences.preferred_locations?.length &&
    !preferences.preferred_locations.map((l) => l.toLowerCase()).includes("remote")
  ) {
    // Match any preferred location (ilike any of the list)
    const orConditions = preferences.preferred_locations.map(
      (loc) => `location.ilike.%${loc.trim()}%`,
    );
    // Supabase: .or() with comma-sep "col.op.value"
    query = query.or(orConditions.join(","));
  }

  if (!preferences.preferred_locations?.length) {
    const locQa = preferences.whatsapp_qa?.location_raw?.trim();
    if (locQa) {
      const low = locQa.toLowerCase();
      if (low.includes("remote")) {
        query = query.eq("remote_allowed", true);
      } else {
        query = query.ilike("location", `%${locQa}%`);
      }
    }
  }

  if (preferences.remote_preference === "remote" || preferences.remote_preference === "hybrid") {
    query = query.eq("remote_allowed", true);
  }

  if (preferences.preferred_seniority?.length) {
    query = query.in("seniority_level", preferences.preferred_seniority);
  }

  if (preferences.preferred_role_functions?.length) {
    query = query.in("role_function", preferences.preferred_role_functions);
  } else {
    const qaRole = preferences.whatsapp_qa?.role_family?.trim();
    if (qaRole) {
      query = query.ilike("title", `%${qaRole}%`);
    }
  }

  if (preferences.salary_min_lpa != null && preferences.salary_min_lpa > 0) {
    const minRupees = Math.round(preferences.salary_min_lpa * LPA_TO_RUPEES);
    // Job's max comp must be at least candidate's min (job can pay enough)
    query = query.gte("compensation_max", minRupees);
  }

  if (preferences.salary_max_lpa != null && preferences.salary_max_lpa > 0) {
    const maxRupees = Math.round(preferences.salary_max_lpa * LPA_TO_RUPEES);
    // Job's min comp must be at most candidate's max (job within budget)
    query = query.lte("compensation_min", maxRupees);
  }

  return query;
}
