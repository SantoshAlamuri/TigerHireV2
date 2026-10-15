/**
 * Tier 2: enrich sparse pdfjs resume text via Haiku (cheaper than Sonnet vision).
 */

import { callClaude } from "@/lib/services/anthropic";
import { MODELS } from "@/lib/config/models";
import { logger } from "@/lib/observability/logger";

const HAIKU_TEXT_PARSE_PROMPT = `You are a resume text recovery assistant. The text below was extracted from a resume PDF but may be incomplete, garbled, or missing sections.

Reconstruct the FULL resume content as plain text:
- Include name, contact, summary, every role with company, title, dates, and bullet points
- Include education, skills, certifications
- Do NOT summarize — expand and recover missing content using only what is implied by the partial text
- Output plain text only (no JSON, no markdown fences)`;

export type HaikuTextParseAttribution = {
  jobId?: string;
  candidateId?: string;
  organisationId?: string;
  scoringSource?: string;
};

/**
 * Send partial pdfjs text to Haiku; returns enriched plain-text resume body.
 */
export async function haikuEnrichResumeText(
  partialText: string,
  attribution?: HaikuTextParseAttribution,
): Promise<string> {
  const input = partialText.trim().slice(0, 40_000);
  logger.info("[haiku-text-parse] Enriching sparse resume text", {
    inputChars: input.length,
    candidateId: attribution?.candidateId,
  });

  const response = await callClaude({
    model: MODELS.HAIKU,
    max_tokens: 8000,
    temperature: 0,
    system:
      "You recover complete resume plain text from partial extractions. Respond with resume text only.",
    messages: [
      {
        role: "user",
        content: `${HAIKU_TEXT_PARSE_PROMPT}\n\n--- Partial extracted text ---\n${input}`,
      },
    ],
    label: "cv-parser-haiku-text",
    jobId: attribution?.jobId,
    candidateId: attribution?.candidateId,
    organisationId: attribution?.organisationId,
    scoringSource: attribution?.scoringSource,
  });

  const text = (response.text ?? "").trim();
  logger.info("[haiku-text-parse] Enrichment complete", {
    outputChars: text.length,
    candidateId: attribution?.candidateId,
  });
  return text;
}
