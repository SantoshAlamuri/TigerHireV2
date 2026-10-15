import { NextRequest, NextResponse } from "next/server";
import { extractTextFromBuffer } from "@/lib/services/extract-document-text";
import { parseResumeWithClaude } from "@/lib/agents/cv-parser";
import { getAnthropicClient } from "@/lib/services/anthropic";
import { logger } from "@/lib/observability/logger";

/**
 * DEBUG-ONLY: Tests each step of the resume parsing pipeline independently.
 * POST /api/debug/test-resume-parse with FormData { file: File }
 *
 * Returns a step-by-step diagnostic report.
 * Only available in development mode.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const steps: Array<{
    step: string;
    status: "pass" | "fail" | "skip";
    durationMs: number;
    detail?: unknown;
    error?: string;
  }> = [];

  // Step 1: Check Anthropic API key
  const keyStart = Date.now();
  try {
    const client = getAnthropicClient();
    const hasKey = Boolean(client);
    steps.push({
      step: "1_anthropic_client",
      status: hasKey ? "pass" : "fail",
      durationMs: Date.now() - keyStart,
      detail: { hasClient: hasKey },
    });
  } catch (e) {
    steps.push({
      step: "1_anthropic_client",
      status: "fail",
      durationMs: Date.now() - keyStart,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Step 2: Read the uploaded file
  let fileBuffer: Buffer | null = null;
  let mimeType = "";
  let fileName = "";
  const readStart = Date.now();
  try {
    const formData = await request.formData();
    const file = (formData.get("file") ?? formData.get("resume")) as File | null;
    if (!file) {
      steps.push({
        step: "2_read_file",
        status: "fail",
        durationMs: Date.now() - readStart,
        error: "No file provided in FormData (send 'file' or 'resume')",
      });
      return NextResponse.json({ steps }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    fileBuffer = Buffer.from(ab);
    mimeType = file.type || "";
    fileName = file.name || "unknown";

    steps.push({
      step: "2_read_file",
      status: "pass",
      durationMs: Date.now() - readStart,
      detail: { fileName, mimeType, sizeBytes: fileBuffer.length },
    });
  } catch (e) {
    steps.push({
      step: "2_read_file",
      status: "fail",
      durationMs: Date.now() - readStart,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ steps }, { status: 400 });
  }

  const isPdf = mimeType === "application/pdf";

  // Step 3: PDF text extraction (pdf-parse)
  let extractedText = "";
  if (isPdf) {
    const extractStart = Date.now();
    try {
      extractedText = await extractTextFromBuffer(fileBuffer!, mimeType, fileName);
      steps.push({
        step: "3_pdf_text_extraction",
        status: extractedText.trim().length > 0 ? "pass" : "fail",
        durationMs: Date.now() - extractStart,
        detail: {
          extractedLength: extractedText.length,
          preview: extractedText.slice(0, 500),
          isEmpty: !extractedText.trim(),
        },
      });
    } catch (e) {
      steps.push({
        step: "3_pdf_text_extraction",
        status: "fail",
        durationMs: Date.now() - extractStart,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    steps.push({
      step: "3_pdf_text_extraction",
      status: "skip",
      durationMs: 0,
      detail: "Not a PDF, skipping pdf-parse extraction",
    });
  }

  // Step 4: Claude text parsing (from extracted text — the fast/reliable path)
  if (extractedText.trim()) {
    const textParseStart = Date.now();
    try {
      const result = await parseResumeWithClaude({
        type: "text",
        text: extractedText,
      });
      steps.push({
        step: "4_claude_text_parse",
        status: "pass",
        durationMs: Date.now() - textParseStart,
        detail: {
          parsed: result.parsed,
          tokens: result.tokens,
          model: result.model,
          hasRawText: Boolean(result.rawTextForStorage),
        },
      });
    } catch (e) {
      steps.push({
        step: "4_claude_text_parse",
        status: "fail",
        durationMs: Date.now() - textParseStart,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    steps.push({
      step: "4_claude_text_parse",
      status: "skip",
      durationMs: 0,
      detail: "No extracted text available to parse",
    });
  }

  // Step 5: Claude native PDF parsing (the full pipeline with fallback)
  if (isPdf) {
    const pdfParseStart = Date.now();
    try {
      const result = await parseResumeWithClaude({
        type: "pdf",
        buffer: fileBuffer!,
      });
      steps.push({
        step: "5_claude_pdf_full_pipeline",
        status: "pass",
        durationMs: Date.now() - pdfParseStart,
        detail: {
          parsed: result.parsed,
          tokens: result.tokens,
          model: result.model,
          hasRawText: Boolean(result.rawTextForStorage),
          rawTextLength: result.rawTextForStorage?.length ?? 0,
        },
      });
    } catch (e) {
      steps.push({
        step: "5_claude_pdf_full_pipeline",
        status: "fail",
        durationMs: Date.now() - pdfParseStart,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    steps.push({
      step: "5_claude_pdf_full_pipeline",
      status: "skip",
      durationMs: 0,
      detail: "Not a PDF",
    });
  }

  const allPassed = steps.every((s) => s.status === "pass" || s.status === "skip");
  logger.info("[test-resume-parse] Diagnostic complete", {
    allPassed,
    stepSummary: steps.map((s) => `${s.step}:${s.status}`).join(", "),
  });

  return NextResponse.json({
    allPassed,
    steps,
  });
}
