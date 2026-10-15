import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeJdTextForParsing, parseJobDescription } from "@/lib/services/anthropic";
import { fetchPageText } from "@/lib/services/fetch-page-text";
import { env } from "@/lib/config/env";
import { reportError } from "@/lib/observability/report-error";
import { validateOrigin } from "@/lib/security/csrf";
import { nanoid } from "nanoid";

const MIN_JD_LENGTH = 50;
const MAX_URL_LENGTH = 2048;

export const maxDuration = 60;

/**
 * POST /api/jobs/parse-jd-url
 * Fetch a public job URL (e.g. LinkedIn, job board), extract text from the page,
 * parse with AI, and return structured data to pre-fill the "Post New JD" form.
 * Note: Sites that render content via JavaScript may not return full job text.
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
        route: "parse-jd-url",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Rate limit exceeded. Please wait before fetching another URL.", 429);
    }

    const parsedBody = await parseJsonBody<{ url?: string }>(
      request,
      "POST /api/jobs/parse-jd-url",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;

    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return jsonError("Missing url in request body", 400);
    if (url.length > MAX_URL_LENGTH) {
      return jsonError("URL is too long", 400);
    }

    try {
      new URL(url);
    } catch {
      return jsonError("Invalid URL", 400);
    }

    let rawText: string;
    try {
      rawText = await fetchPageText(url);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Failed to fetch URL.";
      return jsonError(`Could not load page: ${msg}`, 400);
    }

    const trimmed = normalizeJdTextForParsing(rawText);
    if (trimmed.length < MIN_JD_LENGTH) {
      return jsonError(
        "Not enough job description text could be extracted from this page. Try uploading a PDF/DOCX or a direct job description link. Some sites (e.g. LinkedIn) load content via JavaScript and cannot be fully scraped.",
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
        route: "POST /api/jobs/parse-jd-url",
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
    return handleApiError(err, "Failed to parse JD from URL", {
      route: "POST /api/jobs/parse-jd-url",
    });
  }
}
