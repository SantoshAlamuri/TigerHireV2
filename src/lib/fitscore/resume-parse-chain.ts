/**
 * 3-tier resume text resolution: pdfjs / mammoth (free) → Haiku text → Sonnet vision.
 * Never blocks scoring — returns the best text available.
 */

import { logger } from "@/lib/observability/logger";
import { recordFitScoreObservabilityEvent } from "@/lib/fitscore/scoring-observability";
import { haikuEnrichResumeText } from "@/lib/fitscore/haiku-text-parse";
import { visionFallback } from "@/lib/fitscore/vision-fallback";
import {
  getResumeParseMinChars,
  isCvParserHaikuEnabled,
  isVisionFallbackEnabled,
} from "@/lib/fitscore/resume-parse-config";
import { extractDocxPlainText } from "@/lib/services/docx-extract";
import {
  detectMimeFromBuffer,
  extractTextFromBuffer,
  inferMimeFromName,
} from "@/lib/services/extract-document-text";

export type ResumeParseTier = 1 | 2 | 3;

export type ResumeParseMethod = "pdfjs" | "docx" | "text" | "haiku" | "vision";

export type ResumeFileFormat = "pdf" | "docx" | "doc" | "unknown";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MSWORD_MIME = "application/msword";

export type ResumeParseChainAttribution = {
  jobId?: string;
  candidateId?: string;
  organisationId?: string;
  scoringSource?: string;
};

export type ResumeParseChainResult = {
  text: string;
  tier: ResumeParseTier;
  parse_method: ResumeParseMethod;
  pdfjs_chars: number;
  haiku_chars?: number;
};

/** Detect resume format from filename, MIME, and optional magic bytes. */
export function detectResumeFileFormat(params: {
  fileName?: string;
  mimeType?: string;
  buffer?: Buffer | null;
}): ResumeFileFormat {
  const fromName = inferMimeFromName(params.fileName ?? "");
  const mime = params.mimeType?.trim() || fromName || "";
  const detected =
    params.buffer && params.buffer.length > 0
      ? detectMimeFromBuffer(params.buffer, params.fileName ?? "")
      : null;
  const effective = detected ?? mime;

  if (effective === DOCX_MIME || params.fileName?.toLowerCase().endsWith(".docx")) {
    return "docx";
  }
  if (effective === "application/pdf" || params.fileName?.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (effective === MSWORD_MIME || params.fileName?.toLowerCase().endsWith(".doc")) {
    return "doc";
  }
  return "unknown";
}

/**
 * Tier 1: free local extraction — pdfjs for PDF, mammoth for DOCX.
 * Legacy `.doc` returns empty text so tier 2/3 can run.
 */
export async function extractTier1ResumeText(params: {
  buffer: Buffer;
  format: ResumeFileFormat;
  fileName?: string;
}): Promise<{ text: string; parse_method: ResumeParseMethod; format: ResumeFileFormat }> {
  const { buffer, format, fileName } = params;

  if (format === "docx") {
    try {
      const text = await extractDocxPlainText(buffer);
      return {
        text,
        parse_method: "docx",
        format: "docx",
      };
    } catch (err) {
      logger.warn("[resume-parse-chain] Tier 1 mammoth extraction failed", {
        fileName,
        error: err instanceof Error ? err.message : String(err),
      });
      return { text: "", parse_method: "docx", format: "docx" };
    }
  }

  if (format === "pdf") {
    try {
      const text = await extractTextFromBuffer(buffer, "application/pdf", fileName ?? "resume.pdf");
      return {
        text: (text ?? "").trim(),
        parse_method: "pdfjs",
        format: "pdf",
      };
    } catch (err) {
      logger.warn("[resume-parse-chain] Tier 1 pdfjs extraction failed", {
        fileName,
        error: err instanceof Error ? err.message : String(err),
      });
      return { text: "", parse_method: "pdfjs", format: "pdf" };
    }
  }

  return { text: "", parse_method: "text", format };
}

function logResumeProcessingTier(
  attribution: ResumeParseChainAttribution | undefined,
  payload: Record<string, unknown>,
): void {
  logger.info(JSON.stringify({ type: "resume_processing_tier", ...payload }));
  recordFitScoreObservabilityEvent({
    eventType: "resume_processing_tier",
    jobId: attribution?.jobId,
    candidateId: attribution?.candidateId,
    metadata: payload,
  });
}

/**
 * Resolve the best resume plain-text body using tiers 1→2→3.
 * @param pdfjsText - Pre-extracted text (cv_raw_text or prior extraction)
 * @param fileBuffer - Optional file bytes for tier 1 (PDF → pdfjs, DOCX → mammoth)
 * @param fileName - Used for format detection when fileBuffer is set
 * @param mimeType - Optional MIME hint
 * @param pdfBuffer - PDF bytes for tier 3 vision (defaults to fileBuffer when format is pdf)
 */
export async function runResumeParseChain(params: {
  pdfjsText?: string;
  fileBuffer?: Buffer | null;
  fileName?: string;
  mimeType?: string;
  pdfBuffer?: Buffer | null;
  initialMethod?: ResumeParseMethod;
  attribution?: ResumeParseChainAttribution;
  /** When set, do not run Haiku/vision tiers above this (tryout uses 1). */
  maxTier?: ResumeParseTier;
}): Promise<ResumeParseChainResult> {
  const minChars = getResumeParseMinChars();
  const attribution = params.attribution;
  const candidateId = attribution?.candidateId ?? null;
  const maxTier = params.maxTier ?? 3;

  let tier1Text = (params.pdfjsText ?? "").trim();
  let initialMethod = params.initialMethod ?? "pdfjs";
  let fileFormat: ResumeFileFormat | null = null;
  let pdfBufferForVision = params.pdfBuffer ?? null;

  if (params.fileBuffer && params.fileBuffer.length > 0) {
    fileFormat = detectResumeFileFormat({
      fileName: params.fileName,
      mimeType: params.mimeType,
      buffer: params.fileBuffer,
    });

    if (fileFormat === "docx" || fileFormat === "pdf") {
      const tier1 = await extractTier1ResumeText({
        buffer: params.fileBuffer,
        format: fileFormat,
        fileName: params.fileName,
      });
      if (tier1.text.length > tier1Text.length) {
        tier1Text = tier1.text;
        initialMethod = tier1.parse_method;
      }
      if (fileFormat === "pdf") {
        pdfBufferForVision = params.fileBuffer;
      }
    }
  }

  const pdfjsChars = tier1Text.length;

  if (pdfjsChars >= minChars || maxTier <= 1) {
    const tier1Log: Record<string, unknown> = {
      tier: 1,
      candidate_id: candidateId,
      text_chars: pdfjsChars,
      parse_method: initialMethod,
    };
    if (fileFormat === "docx") {
      tier1Log.format = "docx";
    } else if (fileFormat === "pdf") {
      tier1Log.format = "pdf";
    }
    logResumeProcessingTier(attribution, tier1Log);
    return {
      text: tier1Text,
      tier: 1,
      parse_method: initialMethod === "docx" ? "docx" : initialMethod === "text" ? "text" : "pdfjs",
      pdfjs_chars: pdfjsChars,
    };
  }

  let bestText = tier1Text;
  let haikuChars: number | undefined;

  if (maxTier >= 2 && isCvParserHaikuEnabled() && bestText.length > 0) {
    try {
      const haikuText = await haikuEnrichResumeText(bestText, attribution);
      haikuChars = haikuText.length;
      if (haikuText.length > bestText.length) {
        bestText = haikuText;
      }
      if (haikuText.length >= minChars) {
        logResumeProcessingTier(attribution, {
          tier: 2,
          candidate_id: candidateId,
          pdfjs_chars: pdfjsChars,
          haiku_output_chars: haikuChars,
          format: fileFormat ?? undefined,
        });
        return {
          text: bestText,
          tier: 2,
          parse_method: "haiku",
          pdfjs_chars: pdfjsChars,
          haiku_chars: haikuChars,
        };
      }
    } catch (err) {
      logger.warn("[resume-parse-chain] Tier 2 Haiku failed", {
        candidateId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (
    maxTier >= 3 &&
    isVisionFallbackEnabled() &&
    pdfBufferForVision &&
    pdfBufferForVision.length > 0
  ) {
    try {
      const visionText = await visionFallback(pdfBufferForVision, attribution);
      const visionChars = visionText.length;
      if (visionText.length > bestText.length) {
        bestText = visionText;
      }
      logResumeProcessingTier(attribution, {
        tier: 3,
        candidate_id: candidateId,
        pdfjs_chars: pdfjsChars,
        haiku_chars: haikuChars ?? 0,
        reason: "scanned_pdf",
        vision_chars: visionChars,
        format: fileFormat ?? undefined,
      });
      return {
        text: bestText,
        tier: 3,
        parse_method: "vision",
        pdfjs_chars: pdfjsChars,
        haiku_chars: haikuChars,
      };
    } catch (err) {
      logger.warn("[resume-parse-chain] Tier 3 vision failed", {
        candidateId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logResumeProcessingTier(attribution, {
    tier: bestText === tier1Text ? 1 : haikuChars != null ? 2 : 1,
    candidate_id: candidateId,
    pdfjs_chars: pdfjsChars,
    haiku_chars: haikuChars ?? 0,
    reason: "below_min_chars_using_best_available",
    text_chars: bestText.length,
    format: fileFormat ?? undefined,
  });

  return {
    text: bestText,
    tier: haikuChars != null ? 2 : 1,
    parse_method:
      haikuChars != null && bestText.length > pdfjsChars
        ? "haiku"
        : initialMethod === "docx"
          ? "docx"
          : initialMethod === "text"
            ? "text"
            : "pdfjs",
    pdfjs_chars: pdfjsChars,
    haiku_chars: haikuChars,
  };
}
