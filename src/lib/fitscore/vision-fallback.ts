/**
 * Vision fallback for resume PDFs when text extraction fails.
 * Sends the PDF to Claude (document API) with a prompt to extract ALL text verbatim.
 * Used for designed PDFs where pdf-parse returns garbled or partial text.
 */

import { callClaudeWithUserContent } from "@/lib/services/anthropic";
import { logger } from "@/lib/observability/logger";
import { MODELS } from "@/lib/config/models";

const VISION_FALLBACK_MODEL = MODELS.SONNET;
const MAX_TOKENS = 8000;

const EXTRACT_VERBATIM_PROMPT = `Read this resume carefully. Extract ALL text content including:
- Full name and contact details
- Professional summary
- Every work experience entry with: company name, role title, dates, and ALL bullet points/descriptions
- Education details
- Skills and tools listed
- Certifications and awards

Return the complete resume text in a clean, structured format.
Do NOT summarize. Extract everything verbatim.`;

/**
 * Use Claude to read the PDF and return full verbatim text.
 * Call when pdf-parse (or other text extraction) yields failed/low quality.
 */
export async function visionFallback(
  pdfBuffer: Buffer,
  attribution?: { jobId?: string; candidateId?: string; organisationId?: string },
): Promise<string> {
  const base64PDF = pdfBuffer.toString("base64");
  logger.info("[vision-fallback] Sending PDF to Claude for verbatim extraction", {
    sizeBytes: pdfBuffer.length,
  });

  const response = await callClaudeWithUserContent({
    model: VISION_FALLBACK_MODEL,
    max_tokens: MAX_TOKENS,
    userContent: [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64PDF,
        },
      },
      { type: "text", text: EXTRACT_VERBATIM_PROMPT },
    ],
    label: "vision-fallback-resume",
    jobId: attribution?.jobId,
    candidateId: attribution?.candidateId,
    organisationId: attribution?.organisationId,
  });

  const text = (response.text ?? "").trim();
  logger.info("[vision-fallback] Extracted text from PDF", {
    length: text.length,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  return text;
}
