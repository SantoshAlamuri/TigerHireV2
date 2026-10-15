import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getJdBaseByJobId } from "@/lib/fitscore/hybrid";
import {
  buildBasicVerdictLead,
  buildVerdictLeadFromScores,
} from "@/lib/fitscore/hybrid/extraction-and-verdict";
import { runHybridExplanation, runVerdictExplanation } from "@/lib/fitscore/hybrid/explanation";
import { computeVerdict } from "@/lib/fitscore/hybrid/verdict";
import { computeMarketScore } from "@/lib/fitscore/hybrid/market-score";
import type {
  CandidateExtraction,
  HybridEvidenceJson,
  ScoreBreakdown,
} from "@/lib/fitscore/hybrid/types";
import { candidateExtractionSchema } from "@/lib/validations/fitscore-hybrid";
import { getTryoutOrgId } from "@/lib/tryout/auth";
import { loadTryoutJob } from "@/lib/tryout/jd-base";
import { tryoutExplanationPayload } from "@/lib/tryout/format-insight";
import { saveHybridFitScore } from "@/lib/fitscore/hybrid/persist";
import { buildHybridJdBaseRubricSnapshot } from "@/lib/fitscore/hybrid/rubric-snapshot";
import { computeHybridConfidence } from "@/lib/fitscore/hybrid/confidence";

const FITSCORE_CANDIDATE_COLUMNS = "id, name, full_name, cv_raw_text, updated_at";

function parseStoredExtraction(raw: unknown): CandidateExtraction | null {
  const parsed = candidateExtractionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseBreakdown(raw: unknown): ScoreBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.dimensions || typeof o.dimensions !== "object") return null;
  return raw as ScoreBreakdown;
}

export async function generateTryoutExplanation(params: { jobId: string; candidateId: string }) {
  const orgId = getTryoutOrgId();
  if (!orgId) throw new Error("TRYOUT_ORG_ID not configured");

  const admin = createSupabaseAdmin();
  const job = await loadTryoutJob(admin, params.jobId, orgId);
  if (!job) throw new Error("Job not found");

  const { data: scoreRow } = await admin
    .from("fit_scores")
    .select(
      "id, overall_score, band, v2_extraction, v2_explanation, v2_score_breakdown, one_line_summary, green_flags, red_flags, verdict, ideal_match_pct, ideal_gaps, market_percentile, market_pool_size, market_label, confidence",
    )
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId)
    .is("superseded_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!scoreRow) throw new Error("No score found for this candidate on this job.");

  const existingExplanation = (scoreRow.v2_explanation as string | null)?.trim();
  if (existingExplanation) {
    const extraction = parseStoredExtraction(scoreRow.v2_extraction);
    return tryoutExplanationPayload({
      explanationText: existingExplanation,
      summary: extraction?.summary,
      greenFlags: (scoreRow.green_flags as string[] | null) ?? extraction?.green_flags ?? [],
      redFlags:
        (scoreRow.red_flags as string[] | null) ?? extraction?.red_flags.map((r) => r.flag) ?? [],
      verdict: (scoreRow.verdict as string | null) ?? null,
    });
  }

  const extraction = parseStoredExtraction(scoreRow.v2_extraction);
  const breakdown = parseBreakdown(scoreRow.v2_score_breakdown);
  if (!extraction || !breakdown) {
    throw new Error("Score data incomplete — re-score this CV.");
  }

  const jdBase = await getJdBaseByJobId(admin, params.jobId);
  if (!jdBase?.approvedBy) throw new Error("JD Base is not approved.");

  const { data: candidate } = await admin
    .from("candidates")
    .select(FITSCORE_CANDIDATE_COLUMNS)
    .eq("id", params.candidateId)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found");

  const fitScore = Number(scoreRow.overall_score);
  const fitLabel = String(scoreRow.band ?? "");
  const idealMatchPct = Number(scoreRow.ideal_match_pct ?? extraction.ideal_match_pct ?? 0);
  const idealGaps = (scoreRow.ideal_gaps as string[] | null) ?? extraction.ideal_gaps ?? [];

  const market = {
    percentile: scoreRow.market_percentile as number | null,
    poolSize: Number(scoreRow.market_pool_size ?? 0),
    label: String(scoreRow.market_label ?? "Building"),
    topPct: scoreRow.market_percentile != null ? 100 - Number(scoreRow.market_percentile) : null,
  };

  const verdict = computeVerdict(fitScore, market, idealMatchPct);
  const resumeText = String((candidate as { cv_raw_text?: string | null }).cv_raw_text ?? "");
  const attribution = {
    jobId: params.jobId,
    candidateId: params.candidateId,
    organisationId: orgId,
  };

  let explanation: string;
  let evidence: HybridEvidenceJson;

  if (jdBase.idealCandidateProfile || market.percentile !== null) {
    const result = await runVerdictExplanation({
      jdBase,
      extraction,
      fitScore,
      market,
      verdictLabel: verdict.label,
      idealMatchPct,
      idealGaps,
      breakdown,
      resumeText,
      attribution,
    });
    explanation = result.text;
    evidence = result.evidence;
  } else {
    const result = await runHybridExplanation({
      jdBase,
      extraction,
      fitScore,
      fitLabel,
      breakdown,
      resumeText,
      attribution,
    });
    explanation = result.text;
    evidence = result.evidence;
  }

  const useRich = Boolean(jdBase.idealCandidateProfile) || market.percentile !== null;
  const lead = useRich
    ? buildVerdictLeadFromScores({
        fitScore,
        fitLabel,
        verdict,
        market,
        idealMatchPct,
        idealGaps,
        breakdown,
      })
    : buildBasicVerdictLead({ fitScore, fitLabel, breakdown });
  const fullExplanation = explanation.trim() ? `${lead}\n\n${explanation}` : lead;

  const confidence = computeHybridConfidence(extraction, {
    resumeText,
    extractionUsedVisionFallback: false,
    resumeTruncated: resumeText.length > 120_000,
    applicationCompletenessBonus: 0,
  });

  const rubricSnapshot = buildHybridJdBaseRubricSnapshot(jdBase);
  await saveHybridFitScore(admin, {
    job_id: params.jobId,
    candidate_id: params.candidateId,
    overall_score: fitScore,
    band: fitLabel,
    extraction,
    explanation: fullExplanation,
    evidence,
    breakdown,
    confidence,
    ideal_match_pct: idealMatchPct,
    ideal_gaps: idealGaps,
    market_percentile: market.percentile,
    market_pool_size: market.poolSize,
    market_label: market.label,
    verdict: verdict.label,
    verdict_action: verdict.action,
    jd_base_document_id: jdBase.id,
    jd_base_version: jdBase.version ?? 1,
    rubric_snapshot: rubricSnapshot,
  });

  return tryoutExplanationPayload({
    explanationText: fullExplanation,
    summary: extraction.summary,
    greenFlags: extraction.green_flags,
    redFlags: extraction.red_flags.map((r) => r.flag),
    verdict: verdict.label,
  });
}

export function formatExplanationResponse(explanation: string, scoreRow: Record<string, unknown>) {
  const lines = explanation.split(/\n+/).filter(Boolean);
  const oneLine = lines[0] ?? "";
  const greenFlags = (scoreRow.green_flags as string[] | null) ?? [];
  const redFlags = (scoreRow.red_flags as string[] | null) ?? [];

  return {
    one_line_summary: oneLine,
    key_strengths: greenFlags.slice(0, 5),
    key_gaps: redFlags.slice(0, 5),
    verdict: scoreRow.verdict ?? null,
    v2_explanation: explanation,
  };
}
