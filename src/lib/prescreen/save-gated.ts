import type { SupabaseClient } from "@supabase/supabase-js";

/** Persist a gated-out score row without running FitScore LLM calls. */
export async function saveGatedFitScore(
  supabase: SupabaseClient,
  payload: {
    job_id: string;
    candidate_id: string;
    reason: string;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const row = {
    job_id: payload.job_id,
    candidate_id: payload.candidate_id,
    overall_score: 0,
    band: "Gated Out",
    scoring_version: 2,
    scoring_method: "prescreen_gate",
    scoring_status: "deferred",
    scoring_status_reason: payload.reason,
    scoring_status_updated_at: nowIso,
    summary: `Prescreen gate: ${payload.reason}`,
    one_line_summary: "Did not pass must-have prescreen gate",
    is_test_run: false,
    superseded_at: null as string | null,
    superseded_by_id: null as string | null,
  };

  const { data: latestProduction } = await supabase
    .from("fit_scores")
    .select("id, run_index")
    .eq("job_id", payload.job_id)
    .eq("candidate_id", payload.candidate_id)
    .eq("is_test_run", false)
    .is("superseded_at", null)
    .order("run_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestAnyRun } = await supabase
    .from("fit_scores")
    .select("run_index")
    .eq("job_id", payload.job_id)
    .eq("candidate_id", payload.candidate_id)
    .order("run_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRunIndex = Number(latestAnyRun?.run_index ?? 0) + 1;

  if (latestProduction?.id) {
    const { error: supersedeErr } = await supabase
      .from("fit_scores")
      .update({
        superseded_at: nowIso,
        superseded_by_id: null,
      })
      .eq("id", latestProduction.id);
    if (supersedeErr) {
      throw new Error(`Failed to supersede existing FitScore: ${supersedeErr.message}`);
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("fit_scores")
    .insert({ ...row, run_index: nextRunIndex })
    .select("id")
    .single();
  if (insertError) {
    if (latestProduction?.id) {
      await supabase
        .from("fit_scores")
        .update({
          superseded_at: null,
          superseded_by_id: null,
        })
        .eq("id", latestProduction.id);
    }
    throw new Error(`Failed to save gated FitScore: ${insertError.message}`);
  }

  if (latestProduction?.id && inserted?.id) {
    const { error: linkErr } = await supabase
      .from("fit_scores")
      .update({ superseded_by_id: inserted.id })
      .eq("id", latestProduction.id);
    if (linkErr) {
      throw new Error(`Failed to link superseded FitScore row: ${linkErr.message}`);
    }
  }
}
