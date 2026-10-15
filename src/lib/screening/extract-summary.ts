import { z } from "zod";
import { MODELS } from "@/lib/config/models";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import type { ScreeningMode, ScreeningPromptContext, ScreeningSummary } from "./types";

const screeningSummarySchema = z.object({
  notice_period_days: z.number().int().nullable(),
  current_ctc_lakhs: z.number().nullable(),
  expected_ctc_lakhs: z.number().nullable(),
  location_preference: z.enum(["onsite", "hybrid", "remote", "flexible"]).nullable(),
  english_fluency: z.enum(["high", "medium", "low", "not_assessed"]),
  technical_depth_signal: z.enum(["strong", "moderate", "weak", "not_assessed"]),
  communication_clarity: z.enum(["strong", "moderate", "weak", "not_assessed"]),
  confidence_signal: z.enum(["high", "medium", "low", "not_assessed"]),
  red_flags: z.array(z.string()),
  positive_signals: z.array(z.string()),
  candidate_questions_raised: z.array(z.string()),
  recommendation: z.enum(["shortlist", "reject", "review", "no_data"]),
  recommendation_reason: z.string(),
  key_quote: z.string(),
});

function buildExtractionPrompt(context: ScreeningPromptContext): string {
  const roleCategoryText = context.role_category ?? "unknown";
  return `You are analyzing a recruitment screening ${context.mode} transcript for the role: ${context.role_title}.
Role category: ${roleCategoryText}

The job requirements summary:
${context.jd_summary}

Extract the following fields from the transcript below. If a field is not mentioned or unclear, return null.
Do not invent facts. Return JSON only, no markdown and no commentary:
{
  "notice_period_days": <integer or null>,
  "current_ctc_lakhs": <number or null>,
  "expected_ctc_lakhs": <number or null>,
  "location_preference": "onsite" | "hybrid" | "remote" | "flexible" | null,
  "english_fluency": "high" | "medium" | "low" | "not_assessed",
  "technical_depth_signal": "strong" | "moderate" | "weak" | "not_assessed",
  "communication_clarity": "strong" | "moderate" | "weak" | "not_assessed",
  "confidence_signal": "high" | "medium" | "low" | "not_assessed",
  "red_flags": ["short flag", "..."],
  "positive_signals": ["short signal", "..."],
  "candidate_questions_raised": ["question", "..."],
  "recommendation": "shortlist" | "reject" | "review" | "no_data",
  "recommendation_reason": "1-2 sentence explanation",
  "key_quote": "one verbatim quote from candidate that best captures fit signal (max 25 words)"
}

For mode="whatsapp", "english_fluency", "communication_clarity", and "confidence_signal" must be "not_assessed".

Transcript:
${context.transcript}`;
}

function enforceModeSpecificFields(
  mode: ScreeningMode,
  summary: ScreeningSummary,
): ScreeningSummary {
  if (mode !== "voice") {
    return {
      ...summary,
      english_fluency: "not_assessed",
      communication_clarity: "not_assessed",
      confidence_signal: "not_assessed",
    };
  }
  return summary;
}

export async function extractScreeningSummary(args: {
  context: ScreeningPromptContext;
  attribution?: { jobId?: string; candidateId?: string; organisationId?: string };
}): Promise<ScreeningSummary> {
  const response = await callClaude({
    model: MODELS.HAIKU,
    max_tokens: 1400,
    temperature: 0,
    label: "screening-summary-extraction-v1",
    jobId: args.attribution?.jobId,
    candidateId: args.attribution?.candidateId,
    organisationId: args.attribution?.organisationId,
    messages: [{ role: "user", content: buildExtractionPrompt(args.context) }],
  });

  const raw = extractJsonObject(response.text, "screening-summary-extraction-v1");
  const parsed = screeningSummarySchema.parse(raw);
  return enforceModeSpecificFields(args.context.mode, parsed);
}
