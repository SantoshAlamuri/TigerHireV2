import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { reportError } from "@/lib/observability/report-error";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeJdTextForParsing, parseJobDescription } from "@/lib/services/anthropic";
import {
  extractTextFromFile,
  inferMimeFromName,
  ALLOWED_JD_TYPES,
  MAX_JD_FILE_SIZE,
} from "@/lib/services/extract-document-text";
import { env } from "@/lib/config/env";
import { validateOrigin } from "@/lib/security/csrf";
import { nanoid } from "nanoid";

export const maxDuration = 60;

/**
 * POST /api/jobs/upload-jd
 * Upload a JD document (PDF, DOCX, or TXT), extract text, parse with AI, and return
 * structured data to pre-fill the "Post New JD" form.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "upload-jd",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Upload JD rate limit exceeded. Please wait.", 429);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) return jsonError("No file provided", 400);

    const effectiveType = file.type || inferMimeFromName(file.name || "") || "";
    if (
      !effectiveType ||
      !ALLOWED_JD_TYPES.includes(effectiveType as (typeof ALLOWED_JD_TYPES)[number])
    ) {
      return jsonError("Invalid file type. Accepted: PDF, DOCX, DOC, TXT", 400);
    }

    if (file.size > MAX_JD_FILE_SIZE) {
      return jsonError(`File too large. Maximum ${MAX_JD_FILE_SIZE / 1024 / 1024}MB`, 400);
    }

    let rawText: string;
    try {
      rawText = await extractTextFromFile(file);
    } catch (extractErr) {
      const msg =
        extractErr instanceof Error ? extractErr.message : "Failed to extract text from document.";
      return jsonError(msg, 400);
    }

    const trimmed = normalizeJdTextForParsing(rawText);
    if (trimmed.length < 50) {
      return jsonError(
        "Document text is too short or could not be extracted. Ensure the file contains readable job description text.",
        400,
      );
    }

    if (!env.anthropicApiKey) {
      return jsonError(
        "AI parsing is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
        503,
      );
    }

    let parsed;
    try {
      parsed = await parseJobDescription(trimmed);
    } catch (parseErr) {
      reportError(parseErr, {
        route: "POST /api/jobs/upload-jd",
        userId: ctx.userId,
      });
      const msg = parseErr instanceof Error ? parseErr.message : "AI parsing failed.";
      return jsonError(`Failed to parse job description: ${msg}`, 502);
    }

    const salaryMinRupees =
      parsed.salaryMin != null ? Math.round(parsed.salaryMin * 100_000) : undefined;
    const salaryMaxRupees =
      parsed.salaryMax != null ? Math.round(parsed.salaryMax * 100_000) : undefined;

    const sections = (parsed.sections ?? []).map((s) => ({
      ...s,
      id: nanoid(8),
    }));

    return jsonSuccess({
      rawText: trimmed,
      metadata: {
        title: parsed.titleNormalised,
        location: parsed.location || "",
        roleFunction: parsed.roleFunction || undefined,
        seniorityLevel: parsed.seniorityLevel || undefined,
        remoteAllowed: parsed.remoteAllowed ?? false,
        compensationMin: salaryMinRupees,
        compensationMax: salaryMaxRupees,
        experienceMin: parsed.experienceMin,
        experienceMax: parsed.experienceMax,
        summary: parsed.summary,
      },
      sections,
    });
  } catch (err) {
    return handleApiError(err, "Failed to process JD document", {
      route: "POST /api/jobs/upload-jd",
    });
  }
}
