import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateOrigin } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { parseResumeWithClaude } from "@/lib/agents/cv-parser";
import { extractTextFromBuffer, inferMimeFromName } from "@/lib/services/extract-document-text";
import { logger } from "@/lib/observability/logger";

const CANDIDATE_ROLES = new Set(["candidate_free", "candidate_pro", "super_admin"]);

/**
 * Synchronous résumé parse for the candidate's own latest upload.
 *
 * The upload route enqueues an async (Inngest) parse for downstream scoring, but
 * onboarding needs the parsed fields back immediately to pre-fill the form — and
 * the background worker isn't running in plain `next dev`. This runs the same
 * parser inline and returns the structured fields (also persisting them).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!CANDIDATE_ROLES.has(ctx.role)) return jsonError("Forbidden", 403);

    // Each call is a Claude PDF/text parse — throttle per candidate to cap cost.
    const rl = await checkRateLimit({
      key: `agent:parse-resume:${ctx.userId}`,
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many parse attempts. Please wait a moment and try again.", 429);
    }

    const admin = createSupabaseAdmin();

    const { data: cand } = await admin
      .from("candidates")
      .select("id")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!cand) return jsonError("No candidate profile found", 404);
    const candidateId = cand.id as string;

    const { data: version } = await admin
      .from("resume_versions")
      .select("storage_path, file_name")
      .eq("candidate_id", candidateId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version?.storage_path) return jsonError("No résumé uploaded yet", 400);

    const { data: fileData, error: downloadError } = await admin.storage
      .from("resumes")
      .download(version.storage_path as string);
    if (downloadError || !fileData) return jsonError("Could not read the uploaded résumé", 502);

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const fileName = (version.file_name as string) || "resume.pdf";
    const mimeType = inferMimeFromName(fileName) ?? "";
    const isPdf = mimeType === "application/pdf";

    const result = isPdf
      ? await parseResumeWithClaude({ type: "pdf", buffer: fileBuffer, fileName }, { candidateId })
      : await (async () => {
          const rawText = await extractTextFromBuffer(fileBuffer, mimeType, fileName);
          if (!rawText?.trim()) throw new Error("Text extraction returned empty");
          return parseResumeWithClaude({ type: "text", text: rawText }, { candidateId });
        })();

    const p = result.parsed;
    const update: Record<string, unknown> = {
      cv_parsed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (Array.isArray(p.canonical_skills) && p.canonical_skills.length > 0) {
      update.skills = p.canonical_skills;
    }
    if (p.years_experience != null) update.experience_years = p.years_experience;
    if (p.current_title) update.current_role = p.current_title;
    if (p.current_company) update.current_company = p.current_company;
    if (p.seniority_level) update.seniority_level = p.seniority_level;
    if (p.location_city) update.location = p.location_city;
    if (p.full_name) {
      update.full_name = p.full_name;
      update.name = p.full_name;
    }
    const rawText = result.rawTextForStorage?.slice(0, 100_000);
    if (rawText) update.cv_raw_text = rawText;

    const { error: updateError } = await admin
      .from("candidates")
      .update(update)
      .eq("id", candidateId);
    if (updateError) {
      logger.error("[parse-resume] candidate update failed", {
        candidateId,
        error: String(updateError),
      });
    }

    return jsonSuccess({
      parsed: {
        fullName: p.full_name ?? null,
        currentRole: p.current_title ?? null,
        currentCompany: p.current_company ?? null,
        location: p.location_city ?? null,
        experienceYears: p.years_experience ?? null,
        seniorityLevel: p.seniority_level ?? null,
        skills: Array.isArray(p.canonical_skills) ? p.canonical_skills : [],
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to parse résumé", {
      route: "POST /api/candidates/me/parse-resume",
    });
  }
}
