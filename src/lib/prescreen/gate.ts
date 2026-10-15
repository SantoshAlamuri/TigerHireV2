import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrescreenGateEnabled } from "@/lib/prescreen/flag";
import { missingCvEvidence } from "@/lib/prescreen/cv-evidence";
import { logger } from "@/lib/observability/logger";

export type PrescreenGateResult =
  | { status: "passed" }
  | { status: "failed"; reason: string }
  | { status: "skipped" };

/** Answers (one per gating question) from a single channel. */
export type GateAnswer = { passed: boolean | null };

export type GateSignals = {
  /** Highest precedence: structured form / public-apply answers. */
  formAnswers?: GateAnswer[];
  /** Middle precedence: WhatsApp interactive answers. */
  whatsappAnswers?: GateAnswer[];
  /** Lowest precedence (fallback when no explicit answers): must-haves lacking CV evidence. */
  cvMissingMustHaves?: string[];
};

/**
 * Pure gate resolution with precedence form > WhatsApp > CV.
 * The first channel that has any answers decides; CV evidence is only the
 * fallback when no explicit answers exist. Pure -> unit tested in §6.
 */
export function resolveGateFromSignals(signals: GateSignals): PrescreenGateResult {
  const form = signals.formAnswers ?? [];
  if (form.length > 0) {
    return form.some((a) => a.passed === false)
      ? { status: "failed", reason: "form_answer_failed" }
      : { status: "passed" };
  }

  const whatsapp = signals.whatsappAnswers ?? [];
  if (whatsapp.length > 0) {
    return whatsapp.some((a) => a.passed === false)
      ? { status: "failed", reason: "prescreen_answer_failed" }
      : { status: "passed" };
  }

  if ((signals.cvMissingMustHaves ?? []).length > 0) {
    return { status: "failed", reason: "cv_must_have_not_evident" };
  }

  return { status: "passed" };
}

/**
 * Must-have gate: explicit prescreen answers + CV keyword evidence fallback.
 * When ff_whatsapp_gate is OFF, returns skipped (no blocking).
 */
export async function evaluatePrescreenGate(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  jdBaseDocumentId: string;
  organisationId?: string | null;
  resumeText: string;
}): Promise<PrescreenGateResult> {
  if (!(await isPrescreenGateEnabled(params.organisationId))) {
    return { status: "skipped" };
  }

  const { data: responses, error: respErr } = await params.admin
    .from("prescreen_responses")
    .select("passed, gate_status, question_id")
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId);

  if (respErr) throw respErr;

  const whatsappAnswers: GateAnswer[] = (responses ?? []).map((r) => ({
    passed: r.passed === false || r.gate_status === "failed" ? false : true,
  }));

  const { data: mustHaves, error: reqErr } = await params.admin
    .from("jd_requirements")
    .select("text")
    .eq("jd_base_document_id", params.jdBaseDocumentId)
    .eq("tier", "must_have");

  if (reqErr) throw reqErr;

  const cvMissingMustHaves = missingCvEvidence(
    params.resumeText,
    (mustHaves ?? []) as { text: string }[],
  );

  const result = resolveGateFromSignals({ whatsappAnswers, cvMissingMustHaves });

  if (result.status === "failed") {
    logger.info("[prescreen-gate] gate failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
      reason: result.reason,
    });
  }

  return result;
}
