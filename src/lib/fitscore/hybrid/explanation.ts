/**
 * Stage 4: recruiter-facing explanation — works with any dimension set.
 * Also provides verdict-aware explanations for the talent intelligence layer.
 */

import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { HYBRID_EXPLANATION_MODEL } from "./constants";
import { NO_DEFENSIBLE_QUOTE, validateAndNormalizeEvidenceQuotes } from "./quote-validation";
import type {
  CandidateExtraction,
  EvidenceQuote,
  HybridEvidenceJson,
  JDBaseDocument,
  MarketScore,
  ScoreBreakdown,
} from "./types";

export { validateAndNormalizeEvidenceQuotes, validateEvidenceQuotes } from "./quote-validation";

export function topDimensions(breakdown: ScoreBreakdown, n: number): string[] {
  const entries = Object.entries(breakdown.dimensions).sort(
    (a, b) => b[1].contribution - a[1].contribution,
  );
  return entries.slice(0, n).map(([k]) => k);
}

function cacheableBlock(text: string): {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
} {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

function buildBaseOutputRules(requiredDimensions: string[]): string {
  return `Return ONLY valid JSON:
{
  "text": "exactly 3 sentences in plain text",
  "quotes": [
    {
      "dimension": "dimension_key",
      "quote": "short resume snippet OR NO_DEFENSIBLE_QUOTE",
      "quote_anchor": "optional 12-80 char exact resume substring (preferred when unsure)",
      "location_hint": "short source hint"
    }
  ]
}

Rules:
- For each required dimension include exactly one quotes entry.
- If there is no defensible evidence for a dimension, set quote to "NO_DEFENSIBLE_QUOTE" and explain why in location_hint.
- Prefer quote_anchor: an exact substring copied from the resume (12-80 chars). The system resolves the displayed quote from the anchor.
- If you provide quote without anchor, it must match the resume (whitespace-normalized). Do not paraphrase.
- Keep each resolved quote <= 200 characters; total non-empty quote characters <= 600.
- No markdown, no extra keys, no prose outside JSON.

Required dimensions: ${requiredDimensions.join(", ")}`;
}

export function buildStaticJobContext(jdBase: JDBaseDocument): string {
  return `Job context:
Role: ${jdBase.roleTitle}
Company: ${jdBase.company}
Context: ${jdBase.context.slice(0, 500)}`;
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

function parseExplanationJson(raw: string): { text: string; evidence: HybridEvidenceJson } {
  const parsed = extractJsonObject(raw, "fitscore-hybrid-explanation-json") as Record<
    string,
    unknown
  >;
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  const quoteRows = Array.isArray(parsed.quotes) ? parsed.quotes : [];
  const quotes = quoteRows.map(normalizeQuoteEntry).filter((q): q is EvidenceQuote => q !== null);
  return {
    text,
    evidence: { quotes },
  };
}

export function buildExplanationUserPrompt(params: {
  jdBase: JDBaseDocument;
  extraction: CandidateExtraction;
  fitScore: number;
  fitLabel: string;
  breakdown: ScoreBreakdown;
  resumeText: string;
}): string {
  const { extraction, fitScore, fitLabel, breakdown, resumeText } = params;
  const requiredDimensions = topDimensions(breakdown, 2);
  const tops = requiredDimensions
    .map((k) => `${k} (${breakdown.dimensions[k]?.value ?? "-"}/10)`)
    .join("; ");
  return `Write exactly 3 recruiter-facing sentences:
1) Explain score (${fitScore}, ${fitLabel}) driven by: ${tops}
2) Cite the strongest JD match with concrete evidence
3) Cite the biggest gap/risk with concrete evidence

Candidate extraction:
Summary: ${extraction.summary}
Certifications: ${(extraction.certifications ?? []).join(", ") || "none"}
Quantified impact: ${(extraction.quantified_impact ?? []).join("; ") || "none"}
Red flags: ${JSON.stringify(extraction.red_flags ?? [])}
Green flags: ${(extraction.green_flags ?? []).join("; ") || "none"}
Required dimensions: ${requiredDimensions.join(", ")}

Resume text:
${resumeText.slice(0, 120_000)}

${buildBaseOutputRules(requiredDimensions)}`;
}

/** @deprecated Split-path explanation; unreachable when ff_path_unification is ON (use merged path). */
export async function runHybridExplanation(params: {
  jdBase: JDBaseDocument;
  extraction: CandidateExtraction;
  fitScore: number;
  fitLabel: string;
  breakdown: ScoreBreakdown;
  resumeText: string;
  attribution?: { jobId?: string; candidateId?: string; organisationId?: string };
}): Promise<{ text: string; evidence: HybridEvidenceJson }> {
  const requiredDimensions = topDimensions(params.breakdown, 2);
  const userPrompt = buildExplanationUserPrompt(params);
  const systemPrompt =
    "You write concise recruiter explanations with structured evidence quotes. Exactly three sentences in text.";
  let lastParsed: { text: string; evidence: HybridEvidenceJson } | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const strictness =
      attempt === 0
        ? ""
        : "\nSTRICT RETRY: Any quote not copied exactly from resume is invalid. Use NO_DEFENSIBLE_QUOTE when unsure.";
    const res = await callClaude({
      model: HYBRID_EXPLANATION_MODEL,
      max_tokens: 700,
      temperature: 0.2,
      system: [cacheableBlock(systemPrompt)],
      messages: [
        {
          role: "user",
          content: [
            cacheableBlock(buildStaticJobContext(params.jdBase)),
            { type: "text", text: `${userPrompt}${strictness}` },
          ],
        },
      ],
      label: "fitscore-hybrid-explanation",
      jobId: params.attribution?.jobId ?? params.jdBase.jobId,
      candidateId: params.attribution?.candidateId,
      organisationId: params.attribution?.organisationId,
    });
    try {
      const parsed = parseExplanationJson(res.text);
      lastParsed = parsed;
      const prepared = validateAndNormalizeEvidenceQuotes(
        parsed.evidence,
        params.resumeText,
        requiredDimensions,
      );
      if (parsed.text && prepared.ok) {
        return { text: parsed.text, evidence: prepared.evidence };
      }
    } catch {
      // Retry once with stricter constraints.
    }
  }

  return (
    lastParsed ?? {
      text: "Evidence-based explanation unavailable right now. Review extracted strengths and gaps directly.",
      evidence: {
        quotes: requiredDimensions.map((dimension) => ({
          dimension,
          quote: NO_DEFENSIBLE_QUOTE,
          location_hint: "Evidence validation failed after retry",
        })),
      },
    }
  );
}

export function buildVerdictExplanationPrompt(params: {
  jdBase: JDBaseDocument;
  extraction: CandidateExtraction;
  fitScore: number;
  market: MarketScore;
  verdictLabel: string;
  idealMatchPct: number;
  idealGaps: string[];
  breakdown: ScoreBreakdown;
  resumeText: string;
}): string {
  const {
    extraction,
    fitScore,
    market,
    verdictLabel,
    idealMatchPct,
    idealGaps,
    breakdown,
    resumeText,
  } = params;
  const requiredDimensions = topDimensions(breakdown, 2);
  const tops = requiredDimensions.join("; ");
  const marketInfo =
    market.percentile != null
      ? `Market rank: ${market.label} (top ${market.topPct}% of ${market.poolSize} candidates)`
      : "Market data still building";

  return `Write exactly 3 recruiter-facing sentences for verdict "${verdictLabel}":
1) FitScore ${fitScore} and top dimensions (${tops}). ${marketInfo}.
2) Ideal profile match ${idealMatchPct}%. ${idealGaps.length > 0 ? `Key gaps: ${idealGaps.slice(0, 3).join("; ")}` : "No significant ideal-profile gaps."}
3) Specific interview probe recommendation.

Candidate extraction:
Summary: ${extraction.summary}
Green flags: ${(extraction.green_flags ?? []).join("; ") || "none"}
Red flags: ${JSON.stringify(extraction.red_flags ?? [])}
Required dimensions: ${requiredDimensions.join(", ")}

Resume text:
${resumeText.slice(0, 120_000)}

${buildBaseOutputRules(requiredDimensions)}`;
}

export async function runVerdictExplanation(params: {
  jdBase: JDBaseDocument;
  extraction: CandidateExtraction;
  fitScore: number;
  market: MarketScore;
  verdictLabel: string;
  idealMatchPct: number;
  idealGaps: string[];
  breakdown: ScoreBreakdown;
  resumeText: string;
  attribution?: { jobId?: string; candidateId?: string; organisationId?: string };
}): Promise<{ text: string; evidence: HybridEvidenceJson }> {
  const requiredDimensions = topDimensions(params.breakdown, 2);
  const userPrompt = buildVerdictExplanationPrompt(params);
  const systemPrompt =
    "You write concise recruiter verdict explanations with structured evidence quotes. Exactly three sentences.";
  let lastParsed: { text: string; evidence: HybridEvidenceJson } | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const strictness =
      attempt === 0
        ? ""
        : "\nSTRICT RETRY: quotes must be exact resume substrings; otherwise use NO_DEFENSIBLE_QUOTE.";
    const res = await callClaude({
      model: HYBRID_EXPLANATION_MODEL,
      max_tokens: 700,
      temperature: 0.2,
      system: [cacheableBlock(systemPrompt)],
      messages: [
        {
          role: "user",
          content: [
            cacheableBlock(buildStaticJobContext(params.jdBase)),
            { type: "text", text: `${userPrompt}${strictness}` },
          ],
        },
      ],
      label: "fitscore-hybrid-verdict-explanation",
      jobId: params.attribution?.jobId ?? params.jdBase.jobId,
      candidateId: params.attribution?.candidateId,
      organisationId: params.attribution?.organisationId,
    });
    try {
      const parsed = parseExplanationJson(res.text);
      lastParsed = parsed;
      const prepared = validateAndNormalizeEvidenceQuotes(
        parsed.evidence,
        params.resumeText,
        requiredDimensions,
      );
      if (parsed.text && prepared.ok) {
        return { text: parsed.text, evidence: prepared.evidence };
      }
    } catch {
      // Retry once with stricter constraints.
    }
  }

  return (
    lastParsed ?? {
      text: "Verdict explanation generated without validated quote evidence. Review extracted dimensions directly.",
      evidence: {
        quotes: requiredDimensions.map((dimension) => ({
          dimension,
          quote: NO_DEFENSIBLE_QUOTE,
          location_hint: "Evidence validation failed after retry",
        })),
      },
    }
  );
}
