import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeJdTextForParsing, parseJobDescription } from "@/lib/services/anthropic";
import { env } from "@/lib/config/env";
import { reportError } from "@/lib/observability/report-error";
import { validateOrigin } from "@/lib/security/csrf";
import { nanoid } from "nanoid";

const parseJdTextBodySchema = z.object({
  text: z.string(),
});

export const maxDuration = 60;

/**
 * POST /api/jobs/parse-jd-text
 * Accept raw JD text (pasted/typed by user), parse with AI,
 * and return structured metadata + dynamic sections.
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
        route: "parse-jd-text",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Rate limit exceeded. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/jobs/parse-jd-text");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const bodyParsed = parseJdTextBodySchema.safeParse(parsedBody.body);
    if (!bodyParsed.success) return handleZodError(bodyParsed.error);

    const text = normalizeJdTextForParsing(bodyParsed.data.text);
    if (!text) return jsonError("Missing text in request body", 400);
    if (text.length < 50) {
      return jsonError(
        "Text is too short. Paste at least a few sentences of job description text.",
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
      parsed = await parseJobDescription(text);
    } catch (parseErr) {
      reportError(parseErr, {
        route: "POST /api/jobs/parse-jd-text",
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
      rawText: text,
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
    return handleApiError(err, "Failed to parse JD text", {
      route: "POST /api/jobs/parse-jd-text",
    });
  }
}
