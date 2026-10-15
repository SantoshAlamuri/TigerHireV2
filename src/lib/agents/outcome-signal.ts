import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OutcomeData {
  wasHired: boolean;
  candidateAccepted?: boolean;
  daysToHire?: number;
  wasScheduled?: boolean;
  assignmentSubmitted?: boolean;
  performanceRating?: number; // 1-5
  retained6m?: boolean;
  retained12m?: boolean;
  rejectionReason?: string;
  lowFitscoreOverride?: boolean;
}

export interface OutcomeSignalResult {
  candidateId: string;
  jobId: string;
  outcomeId: string;
  learningIndexRefreshed: boolean;
}

/* ------------------------------------------------------------------ */
/*  Agent                                                              */
/* ------------------------------------------------------------------ */

/**
 * Record a hiring outcome and update the shared learning index.
 *
 * Writes to:
 * - hiring_outcomes (existing table: job_id, candidate_id, organisation_id, outcome, fitscore, band, ...)
 * - agent_outcome_signals (existing table: was_hired, days_to_hire, fit_score_band, fit_score_range, ...)
 * Then refreshes agent_learning_index (existing table: role_function, seniority_level, hire_rate, ...).
 */
export async function runOutcomeSignalWriter(params: {
  candidateId: string;
  jobId: string;
  organisationId: string;
  outcome: OutcomeData;
  recordedBy?: string;
}): Promise<OutcomeSignalResult> {
  const supabase = createSupabaseAdmin();

  // 1. Fetch the fit score + job metadata for enrichment
  const [fitScoreRes, jobRes] = await Promise.all([
    supabase
      .from("fit_scores")
      .select("overall_score, band, dimensions, green_flags, red_flags")
      .eq("job_id", params.jobId)
      .eq("candidate_id", params.candidateId)
      .single(),
    supabase.from("jobs").select("role_function, seniority_level").eq("id", params.jobId).single(),
  ]);

  const fitScore = fitScoreRes.data;
  const job = jobRes.data;

  // 2. Upsert into hiring_outcomes (existing table)
  const { data: outcome, error: outcomeErr } = await supabase
    .from("hiring_outcomes")
    .upsert(
      {
        job_id: params.jobId,
        candidate_id: params.candidateId,
        organisation_id: params.organisationId,
        outcome: params.outcome.wasHired ? "hired" : "rejected",
        fitscore: fitScore?.overall_score ?? null,
        band: fitScore?.band ?? null,
        performance_rating: params.outcome.performanceRating ?? null,
        retained_6m: params.outcome.retained6m ?? null,
        retained_12m: params.outcome.retained12m ?? null,
        low_fitscore_override: params.outcome.lowFitscoreOverride ?? false,
        recorded_by: params.recordedBy ?? null,
      },
      { onConflict: "job_id,candidate_id" },
    )
    .select("id")
    .single();

  if (outcomeErr || !outcome) {
    logger.error("[outcome-signal] failed to write hiring_outcomes", {
      error: outcomeErr?.message,
    });
    throw new Error(`Failed to record outcome: ${outcomeErr?.message ?? "unknown error"}`);
  }

  // 3. Write to agent_outcome_signals (existing table with was_hired, fit_score_band, etc.)
  const score = fitScore?.overall_score ?? null;
  const fitScoreRange =
    score != null ? `[${Math.max(0, score - 5)},${Math.min(100, score + 5)}]` : null;

  const { error: signalErr } = await supabase.from("agent_outcome_signals").insert({
    organisation_id: params.organisationId,
    job_id: params.jobId,
    fit_score_band: fitScore?.band ?? null,
    fit_score_range: fitScoreRange,
    role_function: job?.role_function ?? null,
    seniority_level: job?.seniority_level ?? null,
    was_scheduled: params.outcome.wasScheduled ?? false,
    was_hired: params.outcome.wasHired,
    candidate_accepted: params.outcome.candidateAccepted ?? null,
    days_to_hire: params.outcome.daysToHire ?? null,
    assignment_submitted: params.outcome.assignmentSubmitted ?? false,
  });

  if (signalErr) {
    logger.warn("[outcome-signal] agent_outcome_signals write failed", {
      error: signalErr.message,
    });
  }

  // 4. Refresh the learning index
  let learningIndexRefreshed = false;
  try {
    await refreshLearningIndex(supabase);
    learningIndexRefreshed = true;
  } catch (err) {
    logger.warn("[outcome-signal] learning index refresh failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info("[outcome-signal] recorded", {
    candidateId: params.candidateId,
    jobId: params.jobId,
    wasHired: params.outcome.wasHired,
    learningIndexRefreshed,
  });

  return {
    candidateId: params.candidateId,
    jobId: params.jobId,
    outcomeId: outcome.id,
    learningIndexRefreshed,
  };
}

/**
 * Refresh the aggregated learning index.
 * Groups by role_function + seniority_level + fit_score_band and computes
 * hire_rate, acceptance_rate, avg_days_to_hire, assignment_completion_rate.
 */
async function refreshLearningIndex(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<void> {
  // Use a raw SQL approach for the aggregation — more efficient than pulling all rows
  const { error } = await supabase.rpc("refresh_agent_learning_index" as string);

  if (error) {
    // If the RPC doesn't exist, fall back to a manual aggregation
    if (error.message.includes("does not exist") || error.message.includes("Could not find")) {
      logger.info("[outcome-signal] RPC not found, running inline aggregation");
      await refreshLearningIndexInline(supabase);
      return;
    }
    throw new Error(`Learning index refresh failed: ${error.message}`);
  }
}

/**
 * Inline fallback for learning index refresh when the RPC doesn't exist.
 */
async function refreshLearningIndexInline(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<void> {
  const { data: signals, error } = await supabase
    .from("agent_outcome_signals")
    .select(
      "role_function, seniority_level, fit_score_band, was_hired, candidate_accepted, days_to_hire, assignment_submitted, was_scheduled",
    );

  if (error || !signals || signals.length === 0) return;

  // Group by role_function + seniority_level + fit_score_band
  const groups = new Map<
    string,
    {
      role_function: string;
      seniority_level: string;
      fit_score_band: string;
      total: number;
      hired: number;
      accepted: number;
      totalDays: number;
      daysCount: number;
      assignmentDone: number;
      scheduled: number;
    }
  >();

  for (const s of signals) {
    const key = `${s.role_function ?? "unknown"}|${s.seniority_level ?? "unknown"}|${s.fit_score_band ?? "unknown"}`;
    const g = groups.get(key) ?? {
      role_function: s.role_function ?? "unknown",
      seniority_level: s.seniority_level ?? "unknown",
      fit_score_band: s.fit_score_band ?? "unknown",
      total: 0,
      hired: 0,
      accepted: 0,
      totalDays: 0,
      daysCount: 0,
      assignmentDone: 0,
      scheduled: 0,
    };
    g.total++;
    if (s.was_hired) g.hired++;
    if (s.candidate_accepted) g.accepted++;
    if (s.days_to_hire != null) {
      g.totalDays += s.days_to_hire;
      g.daysCount++;
    }
    if (s.assignment_submitted) g.assignmentDone++;
    if (s.was_scheduled) g.scheduled++;
    groups.set(key, g);
  }

  // Write each group into agent_learning_index (select-then-insert/update — no unique constraint)
  for (const g of groups.values()) {
    const payload = {
      role_function: g.role_function,
      seniority_level: g.seniority_level,
      fit_score_band: g.fit_score_band,
      sample_count: g.total,
      hire_rate: g.total > 0 ? g.hired / g.total : 0,
      acceptance_rate: g.hired > 0 ? g.accepted / g.hired : 0,
      avg_days_to_hire: g.daysCount > 0 ? g.totalDays / g.daysCount : null,
      assignment_completion_rate: g.scheduled > 0 ? g.assignmentDone / g.scheduled : 0,
      last_updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("agent_learning_index")
      .select("id")
      .eq("role_function", g.role_function)
      .eq("seniority_level", g.seniority_level)
      .eq("fit_score_band", g.fit_score_band)
      .maybeSingle();

    if (existing) {
      await supabase.from("agent_learning_index").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("agent_learning_index").insert(payload);
    }
  }

  logger.info("[outcome-signal] learning index refreshed inline", {
    groupCount: groups.size,
  });
}
