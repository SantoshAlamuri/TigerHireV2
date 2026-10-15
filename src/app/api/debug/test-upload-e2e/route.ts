import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extractTextFromBuffer, inferMimeFromName } from "@/lib/services/extract-document-text";
import { parseResumeWithClaude } from "@/lib/agents/cv-parser";
import { logger } from "@/lib/observability/logger";

/**
 * DEBUG-ONLY: Full end-to-end test of the upload pipeline.
 * POST /api/debug/test-upload-e2e with FormData { file, candidateEmail }
 *
 * Uses admin client — bypasses auth. Only available in development.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = (formData.get("file") ?? formData.get("resume")) as File | null;
  const candidateEmail = formData.get("candidateEmail") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const steps: Array<{
    step: string;
    status: string;
    durationMs: number;
    detail?: unknown;
    error?: string;
  }> = [];

  // Step 1: Find candidate by email
  let candidateId: string | null = null;
  const findStart = Date.now();
  if (candidateEmail) {
    const { data } = await admin
      .from("candidates")
      .select("id, full_name, skills, experience_years, cv_parsed_at")
      .eq("email", candidateEmail)
      .single();
    if (data) {
      candidateId = data.id;
      steps.push({
        step: "1_find_candidate",
        status: "pass",
        durationMs: Date.now() - findStart,
        detail: {
          id: data.id,
          existingName: data.full_name,
          existingSkills: data.skills,
          existingExperience: data.experience_years,
          lastParsed: data.cv_parsed_at,
        },
      });
    }
  }

  if (!candidateId) {
    const { data } = await admin
      .from("candidates")
      .select("id, full_name, skills, experience_years, cv_parsed_at")
      .limit(1)
      .single();
    candidateId = data?.id ?? null;
    steps.push({
      step: "1_find_candidate",
      status: candidateId ? "pass" : "fail",
      durationMs: Date.now() - findStart,
      detail: data ?? "No candidates found",
    });
  }

  if (!candidateId) {
    return NextResponse.json({ error: "No candidate found", steps }, { status: 400 });
  }

  // Step 2: Read file
  const readStart = Date.now();
  const ab = await file.arrayBuffer();
  const buffer = Buffer.from(ab);
  const mimeType = file.type || inferMimeFromName(file.name ?? "") || "";
  const isPdf = mimeType === "application/pdf";
  steps.push({
    step: "2_read_file",
    status: "pass",
    durationMs: Date.now() - readStart,
    detail: { fileName: file.name, mimeType, sizeBytes: buffer.length, isPdf },
  });

  // Step 3: Parse resume with Claude (full pipeline including fallback)
  const parseStart = Date.now();
  try {
    const result = isPdf
      ? await parseResumeWithClaude({ type: "pdf", buffer })
      : await (async () => {
          const text = await extractTextFromBuffer(buffer, mimeType, file.name ?? "");
          if (!text?.trim()) throw new Error("Text extraction returned empty");
          return parseResumeWithClaude({ type: "text", text });
        })();

    steps.push({
      step: "3_parse_resume",
      status: "pass",
      durationMs: Date.now() - parseStart,
      detail: {
        parsed: result.parsed,
        tokens: result.tokens,
        model: result.model,
        hasRawText: Boolean(result.rawTextForStorage),
        rawTextLength: result.rawTextForStorage?.length ?? 0,
      },
    });

    // Step 4: Write to DB
    const dbStart = Date.now();
    const payload: Record<string, unknown> = {
      cv_raw_text: result.rawTextForStorage?.slice(0, 100_000) ?? undefined,
      skills: Array.isArray(result.parsed.canonical_skills) ? result.parsed.canonical_skills : [],
      experience_years: result.parsed.years_experience ?? null,
      current_role: result.parsed.current_title ?? null,
      current_company: result.parsed.current_company ?? null,
      seniority_level: result.parsed.seniority_level ?? null,
      location: result.parsed.location_city ?? null,
      cv_parsed_at: new Date().toISOString(),
      availability: result.parsed.availability ?? null,
      salary_expectation_min: result.parsed.salary_expectation_min ?? null,
      salary_expectation_max: result.parsed.salary_expectation_max ?? null,
      updated_at: new Date().toISOString(),
    };
    if (result.parsed.full_name) {
      payload.full_name = result.parsed.full_name;
      payload.name = result.parsed.full_name;
    }

    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    const { error: updateError } = await admin
      .from("candidates")
      .update(cleanPayload)
      .eq("id", candidateId);

    if (updateError) {
      steps.push({
        step: "4_db_write",
        status: "fail",
        durationMs: Date.now() - dbStart,
        error: updateError.message,
      });
    } else {
      // Verify the write
      const { data: updated } = await admin
        .from("candidates")
        .select(
          "id, full_name, skills, experience_years, seniority_level, current_role, current_company, location, cv_parsed_at",
        )
        .eq("id", candidateId)
        .single();

      steps.push({
        step: "4_db_write",
        status: "pass",
        durationMs: Date.now() - dbStart,
        detail: {
          candidateId,
          savedProfile: updated,
        },
      });
    }
  } catch (e) {
    steps.push({
      step: "3_parse_resume",
      status: "fail",
      durationMs: Date.now() - parseStart,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const allPassed = steps.every((s) => s.status === "pass");
  logger.info("[test-upload-e2e] Complete", {
    allPassed,
    steps: steps.map((s) => `${s.step}:${s.status}`),
  });

  return NextResponse.json({ allPassed, candidateId, steps });
}
