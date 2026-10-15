/**
 * Optional upward adjustment to hybrid evidence confidence when the candidate has
 * submitted hireability / screening data on their application for this job.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationHireabilityRow = {
  id?: string;
  candidate_id?: string;
  notice_period_days?: number | null;
  expected_ctc_lpa?: number | null;
  current_ctc_lpa?: number | null;
  relocation_willingness?: string | null;
  available_from?: string | null;
  offers_in_hand?: number | null;
};

/** Cap so application signals cannot dominate CV-based evidence richness. */
export const APPLICATION_CONFIDENCE_BONUS_MAX = 0.16;

export function applicationCompletenessBonusFromRow(
  row: ApplicationHireabilityRow | null | undefined,
  screeningAnswerCount = 0,
): number {
  let b = 0;

  if (row) {
    if (row.notice_period_days != null && row.notice_period_days >= 0) b += 0.035;
    if (row.expected_ctc_lpa != null && Number.isFinite(Number(row.expected_ctc_lpa))) b += 0.035;
    if (row.current_ctc_lpa != null && Number.isFinite(Number(row.current_ctc_lpa))) b += 0.025;
    if (row.relocation_willingness != null && String(row.relocation_willingness).trim() !== "") {
      b += 0.025;
    }
    if (row.available_from != null && String(row.available_from).trim() !== "") b += 0.025;
    if (row.offers_in_hand != null && Number.isFinite(Number(row.offers_in_hand))) b += 0.02;
  }

  if (screeningAnswerCount > 0) b += 0.03;

  return Math.min(APPLICATION_CONFIDENCE_BONUS_MAX, b);
}

export async function fetchApplicationCompletenessBonus(
  admin: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<number> {
  const { data: app } = await admin
    .from("applications")
    .select(
      "id, candidate_id, notice_period_days, expected_ctc_lpa, current_ctc_lpa, relocation_willingness, available_from, offers_in_hand",
    )
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (!app) return 0;

  const applicationId = app.id as string;
  const { count } = await admin
    .from("application_screening_answers")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId);

  return applicationCompletenessBonusFromRow(app as ApplicationHireabilityRow, count ?? 0);
}

/** One round-trip for batch scoring: bonuses per candidate id (0 when no application row). */
export async function prefetchApplicationCompletenessBonusesForJob(
  admin: SupabaseClient,
  jobId: string,
  candidateIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (candidateIds.length === 0) return map;

  for (const cid of candidateIds) {
    map.set(cid, 0);
  }

  const { data: apps } = await admin
    .from("applications")
    .select(
      "id, candidate_id, notice_period_days, expected_ctc_lpa, current_ctc_lpa, relocation_willingness, available_from, offers_in_hand",
    )
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds);

  const rows = apps ?? [];
  const appIds = rows.map((a) => a.id as string).filter(Boolean);

  const screeningCounts = new Map<string, number>();
  if (appIds.length > 0) {
    const { data: answers } = await admin
      .from("application_screening_answers")
      .select("application_id")
      .in("application_id", appIds);
    for (const row of answers ?? []) {
      const aid = row.application_id as string;
      screeningCounts.set(aid, (screeningCounts.get(aid) ?? 0) + 1);
    }
  }

  for (const app of rows) {
    const cid = app.candidate_id as string;
    const aid = app.id as string;
    const n = screeningCounts.get(aid) ?? 0;
    map.set(cid, applicationCompletenessBonusFromRow(app as ApplicationHireabilityRow, n));
  }

  return map;
}
