/**
 * Optional single-call hybrid path: structured extraction + verdict narrative + evidence quotes.
 * Behind FF_MERGED_EXTRACTION_VERDICT. Keeps deterministic FitScore engine unchanged.
 */

import { callClaude } from "@/lib/services/anthropic";
import { resolveHybridExtractionModel } from "@/lib/fitscore/resolve-scoring-models";
import { logger } from "@/lib/observability/logger";
import type { FitScoreCostAttribution } from "@/lib/fitscore/scoring-attribution";
import { logFitScorePreCallSizes } from "@/lib/fitscore/scoring-diagnostic";
import { recordFitScoreObservabilityEvent } from "@/lib/fitscore/scoring-observability";
import { candidateExtractionSchema } from "@/lib/validations/fitscore-hybrid";
import {
  buildExtractionCandidateContent,
  buildExtractionStaticContext,
  buildExtractionSystemPrompt,
} from "./extraction";
import { topDimensions, buildStaticJobContext } from "./explanation";
import {
  NO_DEFENSIBLE_QUOTE,
  sanitizeUnverifiedQuotes,
  validateAndNormalizeEvidenceQuotes,
} from "./quote-validation";
import { computeHybridScore } from "./engine";
import { HYBRID_EXTRACTION_MODEL, MERGED_EXTRACTION_MAX_ATTEMPTS } from "./constants";
import { parseHybridExtractionJson } from "./json-parser";
import { HybridFitScoreError } from "./errors";
import type {
  CandidateExtraction,
  EvidenceQuote,
  HybridEvidenceJson,
  JDBaseDocument,
  MarketScore,
  ScoreBreakdown,
  Verdict,
} from "./types";

const MERGED_SYSTEM_SUFFIX = `You perform extraction AND recruiter verdict drafting in one response. Follow COMBINED OUTPUT FORMAT exactly.`;

const MERGED_VERDICT_RULES = `COMBINED OUTPUT FORMAT:
Return ONE JSON object with exactly two top-level keys: "extraction" and "verdict".

The "extraction" object MUST use the same fields as standalone extraction (candidate_name, total_years, dimension_scores, certifications, quantified_impact, red_flags, green_flags, role_match_tag, summary, and ideal_match_pct / ideal_gaps when an ideal profile exists).

The "verdict" object MUST contain:
- "why_this_verdict": string — exactly 2 or 3 sentences for recruiters: ideal-profile gaps (if relevant from extraction), risks/strengths, and one concrete interview probe. Do NOT include a numeric FitScore, fit band (e.g. "Strong Fit"), or verdict label (e.g. "Strong Hire"); the product prepends those from deterministic scoring.
- "quotes": array of { "dimension": string, "quote": string, "quote_anchor"?: string, "location_hint": string } — exactly TWO entries. Each "dimension" MUST be one of the two dimension keys that have the highest (dimension_scores[key] × weight_percent[key]) products among DIMENSIONS with positive weight; break ties alphabetically by key. Spell dimension keys EXACTLY as listed.
- "amber_flags": optional array of short strings (max 5) for UNCERTAIN watch-items a recruiter should verify with the candidate, NOT treat as facts. Route INFERRED concerns here instead of red_flags — especially: possible employment gaps (name the dates), short average tenure / frequent job changes, and industry-fit doubts (e.g. service-industry-only background for a product role). "Service industry" = IT services / consulting / outsourcing / BPO firms (e.g. TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, HCL, Tech Mahindra) or agency work delivering client projects; "product" = companies building and operating their own product. If an employer's type is unclear from the CV, flag it as uncertain rather than assuming. Phrase each amber item as a hedged, checkable statement ending with what to verify, e.g. "Possible employment gap Mar 2021-Jan 2022 - dates unclear on CV, verify with candidate" or "4 employers in 5 years - confirm reasons for moves". Reserve red_flags for concerns the CV text explicitly supports.

QUOTE AND FLAG RULES (reduce retries and duplication):
- For each required dimension you MUST include exactly one quotes entry. If no defensible evidence, set quote to "NO_DEFENSIBLE_QUOTE" and explain in location_hint.
- Prefer quote_anchor: copy a 12-80 character exact substring from the RESUME TEXT (unique if possible). The system resolves the stored quote from the anchor. Do not paraphrase anchors.
- If you set quote without quote_anchor, use a short exact resume snippet; the system normalizes whitespace before validation.
- Each green_flags entry and each red_flags.flag in "extraction" must be a DISTINCT insight. Do not state the same gap twice with different wording; merge duplicates into one bullet.
- Maximum 5 green_flags and maximum 5 red_flags in "extraction". Fewer is fine; prioritize clarity.
- Each non-empty quote is at most 200 characters; total non-empty quote characters across both quotes must not exceed 600.

Valid JSON only for the outer object. No markdown fences.`;

/** All static prompt content for merged extraction+verdict (one Sonnet cache breakpoint). */
export function buildMergedCacheableSystemText(jdBase: JDBaseDocument): string {
  return [
    buildExtractionSystemPrompt(),
    MERGED_SYSTEM_SUFFIX,
    buildExtractionStaticContext(jdBase),
    MERGED_VERDICT_RULES,
    buildStaticJobContext(jdBase),
  ].join("\n\n");
}

function normalizeQuoteEntry(value: unknown): EvidenceQuote | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const dimension = typeof raw.dimension === "string" ? raw.dimension.trim() : "";
  if (!dimension) return null;
  const quote = typeof raw.quote === "string" ? raw.quote.trim() : "";
  const locationHint = typeof raw.location_hint === "string" ? raw.location_hint.trim() : "";
  const quoteAnchor = typeof raw.quote_anchor === "string" ? raw.quote_anchor.trim() : "";
  return {
    dimension,
    quote,
    location_hint: locationHint.slice(0, 160),
    ...(quoteAnchor ? { quote_anchor: quoteAnchor.slice(0, 120) } : {}),
  };
}

function parseVerdictPayload(rawVerdict: unknown): {
  whyBody: string;
  evidence: HybridEvidenceJson;
} {
  if (!rawVerdict || typeof rawVerdict !== "object") {
    return {
      whyBody: "",
      evidence: { quotes: [] },
    };
  }
  const o = rawVerdict as Record<string, unknown>;
  const whyBody = typeof o.why_this_verdict === "string" ? o.why_this_verdict.trim() : "";
  const quoteRows = Array.isArray(o.quotes) ? o.quotes : [];
  const quotes = quoteRows.map(normalizeQuoteEntry).filter((q): q is EvidenceQuote => q !== null);
  const amberRaw = Array.isArray(o.amber_flags)
    ? o.amber_flags.filter((x): x is string => typeof x === "string").slice(0, 5)
    : [];
  return {
    whyBody,
    evidence: amberRaw.length ? { quotes, amber_flags: amberRaw } : { quotes },
  };
}

/** Deterministic opening lines prepended to model-written verdict body (matches former verdict-explanation facts). */
export function buildVerdictLeadFromScores(params: {
  fitScore: number;
  fitLabel: string;
  verdict: Verdict;
  market: MarketScore;
  idealMatchPct: number;
  idealGaps: string[];
  breakdown: ScoreBreakdown;
}): string {
  const tops = topDimensions(params.breakdown, 2).join("; ");
  const marketInfo =
    params.market.percentile != null
      ? `Market rank: ${params.market.label} (top ${params.market.topPct}% of ${params.market.poolSize} candidates)`
      : "Market data still building";
  const gaps =
    params.idealGaps.length > 0
      ? `Key ideal-profile gaps: ${params.idealGaps.slice(0, 3).join("; ")}.`
      : "No major ideal-profile gaps called out.";
  return `FitScore ${params.fitScore} (${params.fitLabel}); verdict: ${params.verdict.label}. Top dimensions: ${tops}. ${marketInfo}. Ideal profile match ${params.idealMatchPct}%. ${gaps}`;
}

export function buildBasicVerdictLead(params: {
  fitScore: number;
  fitLabel: string;
  breakdown: ScoreBreakdown;
}): string {
  const requiredDimensions = topDimensions(params.breakdown, 2);
  const tops = requiredDimensions
    .map((k) => `${k} (${params.breakdown.dimensions[k]?.value ?? "-"}/10)`)
    .join("; ");
  return `Score ${params.fitScore} (${params.fitLabel}), driven by: ${tops}.`;
}

export interface MergedExtractionVerdictResult {
  extraction: CandidateExtraction;
  /** Model-written sentences only (no deterministic lead). */
  verdictWhyBody: string;
  evidence: HybridEvidenceJson;
}

function logExtractionValidationFailed(
  attribution: FitScoreCostAttribution | undefined,
  reason: string,
): void {
  logger.info(
    JSON.stringify({
      type: "fitscore_extraction_validation_failed",
      candidate_id: attribution?.candidateId ?? null,
      job_id: attribution?.jobId ?? null,
      reason,
    }),
  );
  recordFitScoreObservabilityEvent({
    eventType: "fitscore_extraction_validation_failed",
    jobId: attribution?.jobId,
    candidateId: attribution?.candidateId,
    metadata: { reason },
  });
}

/** Observability for degraded results we knowingly accept on the exhausted-fallback path. */
function warnMergedDegradedAcceptance(
  attribution: FitScoreCostAttribution | undefined,
  eventType:
    | "fitscore_merged_fallback_empty_verdict_body"
    | "fitscore_merged_fallback_unverified_quotes_replaced"
    | "fitscore_merged_fallback_no_evidence_quotes",
  metadata?: Record<string, unknown>,
): void {
  logger.warn(
    JSON.stringify({
      type: eventType,
      candidate_id: attribution?.candidateId ?? null,
      job_id: attribution?.jobId ?? null,
      ...metadata,
    }),
  );
}

export async function runHybridExtractionAndVerdict(
  jdBase: JDBaseDocument,
  resumeText: string,
  attribution?: FitScoreCostAttribution,
): Promise<MergedExtractionVerdictResult> {
  const cacheableSystemText = buildMergedCacheableSystemText(jdBase);
  const resumeContent = buildExtractionCandidateContent(resumeText);

  let lastWhy = "";
  let lastEvidence: HybridEvidenceJson = { quotes: [] };
  let lastExtraction: CandidateExtraction | null = null;
  let lastRawLlmText: string | undefined;

  for (let attempt = 0; attempt < MERGED_EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
    const userContent: Array<{ type: "text"; text: string }> = [
      { type: "text", text: resumeContent },
    ];

    logFitScorePreCallSizes("merged-extraction-verdict", {
      system_prompt_chars: cacheableSystemText.length,
      user_message_chars: userContent.reduce((sum, b) => sum + b.text.length, 0),
      jobId: attribution?.jobId ?? jdBase.jobId,
      candidateId: attribution?.candidateId,
    });

    const extractionModel =
      attribution?.extractionModel ??
      (await resolveHybridExtractionModel({
        organisationId: attribution?.organisationId,
        scoringSource: attribution?.scoringSource,
      }));

    const res = await callClaude({
      model: extractionModel,
      max_tokens: 8192,
      // Deterministic extraction: the same CV + JD must yield the same dimension
      // scores, so re-scoring after a JD re-approval doesn't silently move the
      // number with no input change. (#350)
      temperature: 0,
      jobId: attribution?.jobId ?? jdBase.jobId,
      candidateId: attribution?.candidateId,
      organisationId: attribution?.organisationId,
      system: [
        {
          type: "text",
          text: cacheableSystemText,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      label: "fitscore-hybrid-extraction-verdict",
      scoringSource: attribution?.scoringSource,
    });
    lastRawLlmText = res.text;

    const parsedOuter = parseHybridExtractionJson(res.text);
    if (!parsedOuter.ok) {
      logExtractionValidationFailed(attribution, parsedOuter.error);
      continue;
    }

    const extRaw = parsedOuter.data.extraction;
    const verdictRaw = parsedOuter.data.verdict;
    if (!extRaw || typeof extRaw !== "object") {
      logExtractionValidationFailed(attribution, "missing_extraction_object");
      continue;
    }

    const zod = candidateExtractionSchema.safeParse(extRaw);
    if (!zod.success) {
      logExtractionValidationFailed(
        attribution,
        zod.error.issues[0]?.message ?? "zod_validation_failed",
      );
      continue;
    }
    const extraction = zod.data;

    const { whyBody, evidence: rawEvidence } = parseVerdictPayload(verdictRaw);
    const { breakdown } = computeHybridScore(
      extraction,
      jdBase.weights,
      jdBase.scoreFloor,
      jdBase.fitThresholds,
    );
    const requiredDimensions = topDimensions(breakdown, 2);
    const prepared = validateAndNormalizeEvidenceQuotes(
      rawEvidence,
      resumeText,
      requiredDimensions,
    );

    lastWhy = whyBody;
    lastEvidence = prepared.evidence;
    lastExtraction = extraction;

    if (whyBody && prepared.ok) {
      return { extraction, verdictWhyBody: whyBody, evidence: prepared.evidence };
    }

    const reason = !whyBody
      ? "empty_verdict_body"
      : (prepared.reason ?? "evidence_validation_failed");
    logExtractionValidationFailed(attribution, reason);
  }

  if (lastExtraction) {
    if (!lastWhy) {
      warnMergedDegradedAcceptance(attribution, "fitscore_merged_fallback_empty_verdict_body");
    }

    let fallbackEvidence: HybridEvidenceJson;
    if (lastEvidence.quotes.length > 0) {
      // Attempts exhausted: never let unverified (possibly hallucinated) quote
      // text survive into persisted evidence — replace with the sentinel.
      const sanitized = sanitizeUnverifiedQuotes(lastEvidence, resumeText);
      fallbackEvidence = sanitized.evidence;
      if (sanitized.replacedDimensions.length > 0) {
        warnMergedDegradedAcceptance(
          attribution,
          "fitscore_merged_fallback_unverified_quotes_replaced",
          { dimensions: sanitized.replacedDimensions },
        );
      }
    } else {
      warnMergedDegradedAcceptance(attribution, "fitscore_merged_fallback_no_evidence_quotes");
      fallbackEvidence = {
        quotes: topDimensions(
          computeHybridScore(
            lastExtraction,
            jdBase.weights,
            jdBase.scoreFloor,
            jdBase.fitThresholds,
          ).breakdown,
          2,
        ).map((dimension) => ({
          dimension,
          quote: NO_DEFENSIBLE_QUOTE,
          location_hint: "Evidence validation failed (merged path, single attempt)",
        })),
      };
    }

    return {
      extraction: lastExtraction,
      verdictWhyBody: lastWhy,
      evidence: fallbackEvidence,
    };
  }

  throw new HybridFitScoreError(
    "Merged extraction+verdict failed on single attempt",
    "merged_extraction_verdict_failed",
    lastRawLlmText,
  );
}
