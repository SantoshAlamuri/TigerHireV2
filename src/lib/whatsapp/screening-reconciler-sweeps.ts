import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { startCanonicalScreeningCollectionBestEffort } from "@/lib/whatsapp/screening-qa-flow";
import {
  evaluateCanonicalScreeningGate,
  recordCanonicalGateStatus,
} from "@/lib/screening/canonical-scoring-gate";
import { isWithinCallingWindow } from "@/lib/screening/calling-hours";
import {
  GATE_LOOKBACK_MS,
  MAX_GATE_EVALUATIONS,
  MAX_SESSION_REPAIRS,
  STALLED_SESSION_AFTER_MS,
  isSessionNudgeDue,
  type ReconcilerSummary,
} from "./screening-reconciler";

/** The three repair sweeps. Kept apart from the entry point for the size gate;
 *  see ./screening-reconciler.ts for the invariant list and rationale. */

type SessionRow = {
  phone: string;
  last_message_at: string | null;
  created_at: string | null;
  context: Record<string, unknown> | null;
};

async function lastOutboundAt(admin: SupabaseClient, phone: string): Promise<string | null> {
  const { data } = await admin
    .from("whatsapp_message_log")
    .select("created_at")
    .eq("direction", "outbound")
    .like("phone", `%${phone.replace(/\D/g, "").slice(-10)}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { created_at?: string } | null)?.created_at ?? null;
}

export async function sweepStalledSessions(
  admin: SupabaseClient,
  summary: ReconcilerSummary,
  now: Date,
): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALLED_SESSION_AFTER_MS).toISOString();
  const { data: sessions, error } = await admin
    .from("whatsapp_sessions")
    .select("phone, last_message_at, created_at, context")
    .eq("session_state", "screening_questions")
    .lt("last_message_at", staleBefore)
    .order("last_message_at", { ascending: true })
    .limit(MAX_SESSION_REPAIRS * 3);
  if (error) {
    summary.errors.push(`sessions query: ${error.message}`);
    return;
  }

  for (const row of (sessions ?? []) as SessionRow[]) {
    if (summary.sessionsRepaired >= MAX_SESSION_REPAIRS) break;
    summary.stalledSessionsFound += 1;

    const ctx = row.context ?? {};
    const jobId = ctx.screening_job_id as string | undefined;
    const candidateId = ctx.candidate_id as string | undefined;
    if (!jobId || !candidateId) continue;

    // Sends respect the same IST business window the rest of screening uses;
    // a 3am nudge converts nobody and burns the once-per-day cooldown.
    if (!isWithinCallingWindow({ start: null, end: null, now })) {
      summary.sessionsSkippedCallingWindow += 1;
      continue;
    }

    const outboundAt = await lastOutboundAt(admin, row.phone);
    const verdict = isSessionNudgeDue({
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      lastOutboundAt: outboundAt,
      now,
    });
    if (verdict === "cooldown") {
      summary.sessionsSkippedCooldown += 1;
      continue;
    }
    if (verdict !== "due") continue;

    try {
      const outcome = await startCanonicalScreeningCollectionBestEffort({
        admin: admin as never,
        jobId,
        candidateId,
        applicationId: (ctx.screening_application_id as string | undefined) ?? null,
        phone: row.phone,
        source: "screening-reconciler",
      });
      summary.sessionsRepaired += 1;
      logger.warn("whatsapp_reconciler_stalled_session_repaired", {
        phone_len: row.phone.replace(/\D/g, "").length,
        job_id: jobId,
        candidate_id: candidateId,
        outcome,
      });
    } catch (err) {
      summary.errors.push(
        `session repair ${jobId}/${candidateId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export async function sweepUnrecordedGates(
  admin: SupabaseClient,
  summary: ReconcilerSummary,
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - GATE_LOOKBACK_MS).toISOString();

  // Only jobs that actually ask questions can strand a gate.
  const { data: jobRows, error: jobsErr } = await admin
    .from("job_screening_questions")
    .select("job_id")
    .eq("is_active", true)
    .limit(500);
  if (jobsErr) {
    summary.errors.push(`gate jobs query: ${jobsErr.message}`);
    return;
  }
  const jobIds = [...new Set((jobRows ?? []).map((r) => (r as { job_id: string }).job_id))];
  if (jobIds.length === 0) return;

  const { data: apps, error: appsErr } = await admin
    .from("applications")
    .select("id, job_id, candidate_id, gate_status")
    .in("job_id", jobIds)
    .or("gate_status.is.null,gate_status.eq.pending")
    .gte("created_at", since)
    .limit(MAX_GATE_EVALUATIONS);
  if (appsErr) {
    summary.errors.push(`gate apps query: ${appsErr.message}`);
    return;
  }

  for (const app of (apps ?? []) as Array<{
    job_id: string;
    candidate_id: string;
    gate_status: string | null;
  }>) {
    try {
      summary.gatesEvaluated += 1;
      const gate = await evaluateCanonicalScreeningGate({
        admin,
        jobId: app.job_id,
        candidateId: app.candidate_id,
      });
      if (!gate.applies) continue;
      // Incomplete answers stay pending on purpose — sweep A chases the answers.
      if (gate.block && gate.gateStatus !== "failed") continue;
      const status = gate.block ? (gate.gateStatus ?? "failed") : "passed";
      if (status === (app.gate_status ?? "")) continue;
      await recordCanonicalGateStatus({
        admin,
        jobId: app.job_id,
        candidateId: app.candidate_id,
        gateStatus: status,
      });
      summary.gatesRecorded += 1;
      logger.warn("whatsapp_reconciler_gate_recorded", {
        job_id: app.job_id,
        candidate_id: app.candidate_id,
        gate_status: status,
      });
    } catch (err) {
      summary.errors.push(
        `gate ${app.job_id}/${app.candidate_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
