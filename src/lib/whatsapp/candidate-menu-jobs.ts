import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/** Known placeholder titles that must never appear in the candidate menu. */
export const PLACEHOLDER_JOB_TITLES = new Set(["job description"]);

export const MAX_CANDIDATE_MENU_TITLE_LEN = 80;

/** Demo/seed fixture UUID prefix (e.g. f2000000-0000-4000-8000-000000000001). */
export const DEMO_JOB_ID_PREFIX = "f2000000";

export type CandidateMenuJob = {
  id: string;
  title: string;
  role_function: string | null;
  location: string | null;
};

export function isCandidateMenuEligibleJob(job: { id: string; title?: string | null }): boolean {
  const title = (job.title ?? "").trim();
  if (!title) return false;
  if (PLACEHOLDER_JOB_TITLES.has(title.toLowerCase())) return false;
  if (title.length > MAX_CANDIDATE_MENU_TITLE_LEN) return false;
  if (job.id.toLowerCase().startsWith(DEMO_JOB_ID_PREFIX)) return false;
  return true;
}

/** Lower-case key for grouping; display labels use titleCaseRoleFunction. */
export function normalizeRoleFunctionKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function titleCaseRoleFunction(normalizedLower: string): string {
  if (!normalizedLower) return "";
  return normalizedLower
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Open jobs eligible for the WhatsApp candidate role menu:
 * - status open
 * - at least one jd_base_documents row (inner join)
 * - passes title / demo-id hygiene filters
 */
export async function fetchCandidateMenuOpenJobs(
  supabase: SupabaseClient,
): Promise<CandidateMenuJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, role_function, location, jd_base_documents!inner(id)")
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    logger.warn("candidate-menu-jobs: open jobs query failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) =>
      isCandidateMenuEligibleJob({
        id: String(row.id ?? ""),
        title: row.title as string | null,
      }),
    )
    .map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? "").trim(),
      role_function: (row.role_function as string | null) ?? null,
      location: (row.location as string | null) ?? null,
    }));
}
