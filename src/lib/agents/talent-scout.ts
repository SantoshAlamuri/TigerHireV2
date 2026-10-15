import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enrichCandidateSignal } from "@/lib/services/anthropic";
import { createRunContext, type AgentRunContext, type SignalRecord } from "./types";
import { findExistingCandidate, normalizeEmailForCandidate } from "./candidate-dedup";
import { logAgentRun } from "@/lib/observability/metrics";
import { MODELS } from "@/lib/config/models";

/**
 * Talent Scout Agent — supply-side engine.
 * Processes raw signals, enriches via Claude, creates/updates candidate profiles.
 */
export async function runTalentScoutAgent(signals: SignalRecord[]): Promise<AgentRunContext> {
  const ctx = createRunContext("talent_scout");
  const admin = createSupabaseAdmin();

  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: "running",
    payload: { signalCount: signals.length },
  });

  const totalTokens = { input: 0, output: 0 };

  for (const signal of signals) {
    ctx.recordsProcessed++;

    try {
      const { data: existing } = await admin
        .from("signals")
        .select("id, candidate_id")
        .eq("source", signal.source)
        .eq("external_id", signal.external_id)
        .single();

      if (existing) {
        ctx.recordsUpdated++;
        continue;
      }

      const rawText =
        typeof signal.raw_data.text === "string"
          ? signal.raw_data.text
          : JSON.stringify(signal.raw_data);

      const { _tokens, ...enriched } = await enrichCandidateSignal(rawText, signal.source);
      totalTokens.input += _tokens.input;
      totalTokens.output += _tokens.output;

      const normEmail = normalizeEmailForCandidate(enriched.email);

      let candidateId = await findExistingCandidate(
        admin,
        { email: normEmail, phone: enriched.phone, name: enriched.name },
        { matchByName: true },
      );

      if (candidateId) {
        await admin
          .from("candidates")
          .update({
            intent_score: Math.max(enriched.intentScore ?? 0, 0),
            skills: enriched.skills,
            experience_years: enriched.experienceYears,
            location: [enriched.locationCity, enriched.locationState].filter(Boolean).join(", "),
            ...(normEmail && { email: normEmail }),
            ...(enriched.phone && { phone: enriched.phone }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", candidateId);
        ctx.recordsUpdated++;
      }

      if (!candidateId) {
        const { data: newCandidate, error: candidateError } = await admin
          .from("candidates")
          .insert({
            name: enriched.name ?? null,
            email: normEmail ?? null,
            phone: enriched.phone ?? null,
            skills: enriched.skills,
            experience_years: enriched.experienceYears,
            location:
              [enriched.locationCity, enriched.locationState].filter(Boolean).join(", ") || null,
            intent_score: enriched.intentScore ?? 0,
            visibility: true,
          })
          .select("id")
          .single();

        if (candidateError) {
          ctx.errors.push(`Candidate insert failed: ${candidateError.message}`);
          continue;
        }

        candidateId = newCandidate.id;
        ctx.recordsCreated++;
      }

      const signalStrength = Math.min(100, Math.max(0, enriched.intentScore ?? 0));
      await admin.from("signals").insert({
        source: signal.source,
        external_id: signal.external_id,
        raw_data: signal.raw_data,
        signal_strength: signalStrength,
        status: "enriched",
        candidate_id: candidateId,
        processed_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      ctx.errors.push(`Signal ${signal.external_id}: ${message}`);
    }
  }

  await logAgentRun(
    admin,
    "talent_scout",
    "batch_signals",
    ctx.runId,
    ctx.errors.length > 0 ? "error" : "success",
    Date.now() - ctx.startedAt.getTime(),
    ctx.errors.length > 0 ? ctx.errors.slice(0, 3).join("; ") : undefined,
    totalTokens.input > 0 ? totalTokens : undefined,
    totalTokens.input > 0 ? MODELS.SONNET : undefined,
  );

  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: ctx.errors.length > 0 ? "completed_with_errors" : "completed",
    payload: {
      recordsProcessed: ctx.recordsProcessed,
      recordsCreated: ctx.recordsCreated,
      recordsUpdated: ctx.recordsUpdated,
      errorsCount: ctx.errors.length,
      errors: ctx.errors.slice(0, 10),
      durationMs: Date.now() - ctx.startedAt.getTime(),
    },
  });

  return ctx;
}

/**
 * Process raw signals already in the database (e.g. from POST /signals/ingest).
 * Enriches each, finds/creates candidate, updates signal to status=enriched.
 */
export async function processUnprocessedSignals(batchSize = 50): Promise<AgentRunContext> {
  const admin = createSupabaseAdmin();

  const { data: rawSignals, error: selectError } = await admin
    .from("signals")
    .select("id, source, external_id, raw_data")
    .eq("status", "raw")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  // Surface query failures instead of silently returning an empty run — a
  // schema error here previously made the cron no-op for weeks unnoticed.
  if (selectError) {
    const ctx = createRunContext("talent_scout");
    ctx.errors.push(`Failed to fetch raw signals: ${selectError.message}`);
    return ctx;
  }

  if (!rawSignals?.length) {
    return createRunContext("talent_scout");
  }

  const ctx = createRunContext("talent_scout");
  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: "running",
    payload: { signalCount: rawSignals.length },
  });

  const totalTokens = { input: 0, output: 0 };

  for (const row of rawSignals) {
    ctx.recordsProcessed++;
    try {
      const rawText =
        typeof row.raw_data === "object" && row.raw_data !== null && "text" in row.raw_data
          ? String((row.raw_data as { text?: string }).text ?? JSON.stringify(row.raw_data))
          : JSON.stringify(row.raw_data);
      const { _tokens, ...enriched } = await enrichCandidateSignal(rawText, row.source);
      totalTokens.input += _tokens.input;
      totalTokens.output += _tokens.output;

      const normEmail = normalizeEmailForCandidate(enriched.email);

      let candidateId = await findExistingCandidate(
        admin,
        { email: normEmail, phone: enriched.phone, name: enriched.name },
        { matchByName: true },
      );

      if (candidateId) {
        await admin
          .from("candidates")
          .update({
            intent_score: Math.max(enriched.intentScore ?? 0, 0),
            skills: enriched.skills,
            experience_years: enriched.experienceYears,
            location: [enriched.locationCity, enriched.locationState].filter(Boolean).join(", "),
            ...(normEmail && { email: normEmail }),
            ...(enriched.phone && { phone: enriched.phone }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", candidateId);
        ctx.recordsUpdated++;
      } else {
        const { data: newCandidate, error: candidateError } = await admin
          .from("candidates")
          .insert({
            name: enriched.name ?? null,
            email: normEmail ?? null,
            phone: enriched.phone ?? null,
            skills: enriched.skills,
            experience_years: enriched.experienceYears,
            location:
              [enriched.locationCity, enriched.locationState].filter(Boolean).join(", ") || null,
            intent_score: enriched.intentScore ?? 0,
            visibility: true,
          })
          .select("id")
          .single();
        if (candidateError) {
          ctx.errors.push(`Candidate insert ${row.external_id}: ${candidateError.message}`);
          continue;
        }
        candidateId = newCandidate!.id;
        ctx.recordsCreated++;
      }

      const signalStrength = Math.min(100, Math.max(0, enriched.intentScore ?? 0));
      await admin
        .from("signals")
        .update({
          candidate_id: candidateId,
          status: "enriched",
          signal_strength: signalStrength,
          processed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.errors.push(`Signal ${row.external_id}: ${message}`);
    }
  }

  await logAgentRun(
    admin,
    "talent_scout",
    "cron_unprocessed",
    ctx.runId,
    ctx.errors.length > 0 ? "error" : "success",
    Date.now() - ctx.startedAt.getTime(),
    ctx.errors.length > 0 ? ctx.errors.slice(0, 3).join("; ") : undefined,
    totalTokens.input > 0 ? totalTokens : undefined,
    totalTokens.input > 0 ? MODELS.SONNET : undefined,
  );

  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: ctx.errors.length > 0 ? "completed_with_errors" : "completed",
    payload: {
      recordsProcessed: ctx.recordsProcessed,
      recordsCreated: ctx.recordsCreated,
      recordsUpdated: ctx.recordsUpdated,
      errorsCount: ctx.errors.length,
      errors: ctx.errors.slice(0, 10),
    },
  });
  return ctx;
}
