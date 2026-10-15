/**
 * Canonical, always-on FitScore scoring gate driven by per-job
 * `job_screening_questions` (recruiter-set, `fail_on_yes` = expected answer)
 * with answers in `application_screening_answers` (`answer_yes`).
 *
 * Unlike the legacy `prescreen` gate (flag-gated, reads `applications.gate_status`),
 * this gate is uniform across ALL channels and runs at the single scoring choke
 * point (`FitScoreService.computeSingle`). FitScore scoring may proceed only when
 * every active gating question is ANSWERED and the answers MATCH the expected
 * answer:
 *   - no questions             -> no-op (proceed; legacy gate may still apply)
 *   - incomplete / no answers  -> block (gate_status "pending")
 *   - knockout (answer fails)  -> block (gate_status "failed")
 *   - all answered + match     -> proceed
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateScreeningAnswers,
  fetchActiveScreeningQuestions,
  type ScreeningAnswerItem,
} from "@/lib/screening/job-screening";
import type { GateStatus } from "@/lib/prescreen/types";
import { logger } from "@/lib/observability/logger";
import { isOrgWhatsappScreeningEnabled } from "@/lib/screening/org-whatsapp-screening";

export type CanonicalScreeningGateResult =
  | { applies: false }
  | { applies: true; block: false }
  | {
      applies: true;
      block: true;
      reason: "incomplete" | "knockout";
      gateStatus: Extract<GateStatus, "pending" | "failed">;
      message: string;
    };

/**
 * Load the most recent application for a job+candidate and its screening answers.
 * Returns null when there is no application row yet (gate treats this as incomplete).
 */
async function loadApplicationAnswers(
  admin: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<{ applicationId: string; answers: ScreeningAnswerItem[] } | null> {
  const { data: app } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const applicationId = (app as { id?: string } | null)?.id;
  if (!applicationId) return null;

  const { data: rows } = await admin
    .from("application_screening_answers")
    .select("question_id, answer_yes, answer_text")
    .eq("application_id", applicationId);

  const answers: ScreeningAnswerItem[] = (rows ?? []).map((r) => {
    const row = r as {
      question_id: string;
      answer_yes: boolean | null;
      answer_text: string | null;
    };
    return {
      questionId: String(row.question_id),
      ...(row.answer_yes != null ? { answerYes: Boolean(row.answer_yes) } : {}),
      ...(row.answer_text != null ? { answerText: String(row.answer_text) } : {}),
    };
  });

  return { applicationId, answers };
}

/**
 * Always-on canonical screening evaluation for FitScore scoring.
 * Does NOT depend on `isPrescreenGateEnabled`.
 */
/** Job → organisation, for deciding whether this org can actually ask the questions. */
async function resolveJobOrganisationId(
  admin: SupabaseClient,
  jobId: string,
): Promise<string | null> {
  const { data } = await admin.from("jobs").select("organisation_id").eq("id", jobId).maybeSingle();
  return (data as { organisation_id?: string | null } | null)?.organisation_id ?? null;
}

export async function evaluateCanonicalScreeningGate(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
}): Promise<CanonicalScreeningGateResult> {
  const { admin, jobId, candidateId } = params;

  const questions = await fetchActiveScreeningQuestions(admin, jobId);
  if (questions.length === 0) return { applies: false };

  // The gate and the asker must agree. The collector
  // (startCanonicalScreeningCollection) bails out unless the org's screening
  // mode is 'whatsapp' — and the mode defaults to 'off'. So a default-configured
  // org whose recruiter added screening questions held EVERY candidate on that
  // job forever: nobody was ever asked, and nothing timed the hold out.
  // Fail open when the org cannot ask, and say so loudly.
  const orgId = await resolveJobOrganisationId(admin, jobId);
  const canAsk = await isOrgWhatsappScreeningEnabled(orgId, admin);
  if (!canAsk) {
    logger.warn("canonical_screening_gate_open_no_asker", {
      jobId,
      candidateId,
      organisationId: orgId,
      reason: "org_screening_mode_not_whatsapp",
    });
    return { applies: false };
  }

  const loaded = await loadApplicationAnswers(admin, jobId, candidateId);

  // No application row / no answers => incomplete (block until answered).
  const ev = evaluateScreeningAnswers(questions, loaded?.answers ?? []);
  if (ev.ok) return { applies: true, block: false };

  return {
    applies: true,
    block: true,
    reason: ev.reason,
    gateStatus: ev.reason === "knockout" ? "failed" : "pending",
    message: ev.message,
  };
}

/**
 * Best-effort write of `applications.gate_status` for observability. Never throws.
 * Mirrors the canonical decision onto the legacy column so dashboards stay consistent.
 */
export async function recordCanonicalGateStatus(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  gateStatus: GateStatus;
}): Promise<void> {
  const { admin, jobId, candidateId, gateStatus } = params;
  try {
    await admin
      .from("applications")
      .update({ gate_status: gateStatus, updated_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId);
  } catch (error) {
    logger.warn("canonical screening gate: failed to record gate_status", {
      job_id: jobId,
      candidate_id: candidateId,
      gate_status: gateStatus,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
