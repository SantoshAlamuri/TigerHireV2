import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { resolveCvParseModel } from "@/lib/fitscore/resolve-scoring-models";
import { CV_PARSE_PROMPT } from "@/lib/agents/prompts/cv-parse";
import { ParsedCVSchema } from "@/lib/agents/schemas";
import { parseCvOutputWithRepairs } from "@/lib/agents/cv-parse-repair";
import { logger } from "@/lib/observability/logger";
import type { ResumeQuality } from "@/lib/fitscore/resume-validation";
import { validateResumeText } from "@/lib/fitscore/resume-validation";
import { detectResumeFileFormat, runResumeParseChain } from "@/lib/fitscore/resume-parse-chain";
import { normalizeParsedCV } from "@/lib/agents/normalizer";
import { validateParsedCV } from "@/lib/agents/validator";

/** Parse method used to obtain resume text (for confidence and logging). */
export type ParseMethod = "text_extraction" | "vision_fallback" | "manual_required";

const CV_PARSE_SYSTEM =
  "You are a CV parser. You MUST respond with ONLY valid JSON — no markdown, no explanation, no text before or after the JSON object. The JSON must conform to the schema: { full_name?: string, email?: string, phone?: string (mobile from CV header/contact block, null if absent), canonical_skills: string[], seniority_level: string, years_experience: number, current_title?: string, current_company?: string, location_city?: string, salary_expectation_min?: number, salary_expectation_max?: number, availability: string, authenticity_flags: string[] }";

/**
 * Normalize salary to LPA (lakhs per annum). Claude may return:
 *   - LPA value directly (e.g. 35 for 35 LPA) — keep as-is
 *   - Annual INR (e.g. 3500000) — divide by 100_000
 *   - Monthly INR (e.g. 250000) — multiply by 12, divide by 100_000
 */
function normalizeSalaryLpa(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (isNaN(n) || n <= 0) return null;
  if (n > 100_000) return Math.round(n / 100_000);
  if (n > 500) return Math.round((n * 12) / 100_000);
  return Math.round(n);
}

/**
 * Normalize parser output to ParsedCVSchema (e.g. map current_role -> current_title, skills -> canonical_skills).
 */
function normalizeParsed(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  if (out.phone != null && typeof out.phone !== "string") {
    out.phone = String(out.phone);
  }
  if (typeof out.phone === "string") {
    const p = out.phone.trim().slice(0, 40);
    out.phone = p.length > 0 ? p : null;
  }
  if (out.current_role != null && out.current_title == null) out.current_title = out.current_role;
  if (Array.isArray(out.skills) && !Array.isArray(out.canonical_skills)) {
    out.canonical_skills = (out.skills as Array<{ name?: string } | string>)
      .map((s) => (typeof s === "string" ? s : ((s as { name?: string }).name ?? "")))
      .filter(Boolean);
  }
  out.salary_expectation_min = normalizeSalaryLpa(out.salary_expectation_min);
  out.salary_expectation_max = normalizeSalaryLpa(out.salary_expectation_max);
  return out;
}

export interface ParsedResumeResult {
  parsed: ReturnType<typeof ParsedCVSchema.parse>;
  rawTextForStorage?: string | null;
  tokens: { input: number; output: number };
  model: string;
  /** Quality of extracted text (for confidence and pipeline). */
  parseQuality?: ResumeQuality;
  /** How the resume text was obtained. */
  parseMethod?: ParseMethod;
  /** Warnings from validation (e.g. low word count). */
  parseWarnings?: string[];
}

/** Hiring org / job / candidate for LLM ledger rows when parsing a resume. */
export type ResumeParseCostAttribution = {
  organisationId?: string;
  jobId?: string;
  candidateId?: string;
};

/**
 * Parse extracted text via Claude (structure only; text is already validated).
 */
async function parseTextWithClaude(
  text: string,
  meta?: {
    parseQuality?: ResumeQuality;
    parseMethod?: ParseMethod;
    parseWarnings?: string[];
  },
  attribution?: ResumeParseCostAttribution,
): Promise<ParsedResumeResult> {
  const cvParseModel = await resolveCvParseModel(attribution?.organisationId);
  const prompt = CV_PARSE_PROMPT.replace("{{CV_TEXT}}", text.slice(0, 50_000));
  logger.info("[cv-parser] Sending text to Claude", {
    textLength: text.length,
    model: cvParseModel,
  });
  const response = await callClaude({
    model: cvParseModel,
    max_tokens: 4096,
    temperature: 0,
    system: CV_PARSE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    label: "cv-parser-text",
    organisationId: attribution?.organisationId,
    jobId: attribution?.jobId,
    candidateId: attribution?.candidateId,
  });

  logger.info("[cv-parser] Claude text response received", {
    responseLength: response.text.length,
  });
  const raw = extractJsonObject(response.text, "CV parser") as Record<string, unknown>;
  const schemaParsed = parseCvOutputWithRepairs(normalizeParsed(raw), {
    candidateId: attribution?.candidateId,
    organisationId: attribution?.organisationId,
  });
  const parsed = normalizeParsedCV(schemaParsed);
  const validation = validateParsedCV(parsed);
  if (validation.flags.length > 0) {
    parsed.authenticity_flags = Array.from(
      new Set([...(parsed.authenticity_flags ?? []), ...validation.flags]),
    );
  }
  logger.info("[cv-parser] Parsed CV from text", {
    name: parsed.full_name,
    skills: parsed.canonical_skills?.length,
    seniority: parsed.seniority_level,
    validationFlags: validation.flags,
  });

  return {
    parsed,
    rawTextForStorage: text.slice(0, 100_000),
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    model: cvParseModel,
    parseQuality: meta?.parseQuality,
    parseMethod: meta?.parseMethod,
    parseWarnings: meta?.parseWarnings,
  };
}

/**
 * Parse a resume via Claude. File inputs use the 3-tier parse chain:
 *   PDF → pdfjs (tier 1) → Haiku → Sonnet vision
 *   DOCX → mammoth (tier 1) → Haiku → (no vision on Word)
 *   DOC → tier 2/3 only (legacy OLE; tier 1 skipped)
 */
export async function parseResumeWithClaude(
  input:
    | {
        type: "pdf";
        buffer: Buffer;
        fileName?: string;
      }
    | {
        type: "docx";
        buffer: Buffer;
        fileName?: string;
      }
    | {
        type: "text";
        text: string;
      },
  attribution?: ResumeParseCostAttribution,
): Promise<ParsedResumeResult> {
  if (input.type === "text") {
    const validation = validateResumeText(input.text);
    return parseTextWithClaude(
      input.text,
      {
        parseQuality: validation.quality,
        parseMethod: "text_extraction",
        parseWarnings: validation.warnings,
      },
      attribution,
    );
  }

  const fileName = input.fileName ?? (input.type === "docx" ? "resume.docx" : "resume.pdf");
  const mimeType =
    input.type === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";

  logger.info("[cv-parser] Starting file parse (3-tier chain)", {
    bufferSize: input.buffer.length,
    format: input.type,
    fileName,
  });

  const chain = await runResumeParseChain({
    pdfjsText: "",
    fileBuffer: input.buffer,
    fileName,
    mimeType,
    pdfBuffer: input.type === "pdf" ? input.buffer : null,
    initialMethod: input.type === "docx" ? "docx" : "pdfjs",
    attribution: {
      organisationId: attribution?.organisationId,
      jobId: attribution?.jobId,
      candidateId: attribution?.candidateId,
    },
  });
  const text = chain.text;

  const validation = validateResumeText(text);
  const parseQuality = validation.quality;
  const parseWarnings = validation.warnings;
  const parseMethod: ParseMethod =
    chain.parse_method === "vision" ? "vision_fallback" : "text_extraction";

  if (!text || text.length < 50) {
    const formatHint =
      input.type === "docx"
        ? "valid Word document (.docx)"
        : "valid PDF with selectable or readable text";
    throw new Error(
      `Could not extract sufficient text from the resume. Please ensure the file is a ${formatHint}.`,
    );
  }

  return parseTextWithClaude(
    text,
    {
      parseQuality,
      parseMethod,
      parseWarnings,
    },
    attribution,
  );
}

/** Parse any supported resume file buffer (PDF, DOCX, or legacy DOC). */
export async function parseResumeFileWithClaude(
  buffer: Buffer,
  fileName: string,
  attribution?: ResumeParseCostAttribution,
): Promise<ParsedResumeResult> {
  const format = detectResumeFileFormat({ buffer, fileName });
  if (format === "docx") {
    return parseResumeWithClaude({ type: "docx", buffer, fileName }, attribution);
  }
  if (format === "pdf") {
    return parseResumeWithClaude({ type: "pdf", buffer, fileName }, attribution);
  }
  const chain = await runResumeParseChain({
    pdfjsText: "",
    fileBuffer: buffer,
    fileName,
    initialMethod: "text",
    attribution: {
      organisationId: attribution?.organisationId,
      jobId: attribution?.jobId,
      candidateId: attribution?.candidateId,
    },
  });
  const text = chain.text;
  if (!text || text.length < 50) {
    throw new Error(
      "Could not extract sufficient text from the resume. For legacy .doc files, try saving as .docx or PDF.",
    );
  }
  const validation = validateResumeText(text);
  return parseTextWithClaude(
    text,
    {
      parseQuality: validation.quality,
      parseMethod: chain.parse_method === "vision" ? "vision_fallback" : "text_extraction",
      parseWarnings: validation.warnings,
    },
    attribution,
  );
}

/**
 * Parse a CV text string via Claude and return structured data with token usage.
 * Shared by Scout (WhatsApp) and Public Apply flows.
 */
export async function parseCVWithClaude(
  cvText: string,
  attribution?: ResumeParseCostAttribution,
): Promise<{
  parsed: ReturnType<typeof ParsedCVSchema.parse>;
  tokens: { input: number; output: number };
  model: string;
}> {
  const result = await parseResumeWithClaude({ type: "text", text: cvText }, attribution);
  return {
    parsed: result.parsed,
    tokens: result.tokens,
    model: result.model,
  };
}
