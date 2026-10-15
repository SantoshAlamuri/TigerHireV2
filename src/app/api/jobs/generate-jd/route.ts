import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { generateJobFromPrompt } from "@/lib/services/anthropic";
import { validateOrigin } from "@/lib/security/csrf";
import { nanoid } from "nanoid";

export const maxDuration = 60;

const generateJdInputSchema = z
  .object({
    prompt: z.string().min(10).max(15_000),
    companyTone: z.string().max(400).optional(),
    companyContext: z.string().max(4_000).optional(),
    mustInclude: z.array(z.string().max(300)).max(20).optional(),
  })
  .strict();

/**
 * POST /api/jobs/generate-jd
 * Body: { prompt: string, companyTone?: string, companyContext?: string, mustInclude?: string[] }
 * Uses AI to generate a full JD and structured fields from a short description.
 * Returns same shape as upload-jd for form pre-fill.
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

    const parsedBody = await parseJsonBody(request, "POST /api/jobs/generate-jd");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = generateJdInputSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "generate-jd",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 15,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Generate JD rate limit exceeded. Please wait.", 429);

    const generated = await generateJobFromPrompt(parsed.data.prompt.trim(), {
      companyTone: parsed.data.companyTone,
      companyContext: parsed.data.companyContext,
      mustInclude: parsed.data.mustInclude,
    });

    const salaryMinRupees =
      generated.salaryMin != null ? Math.round(generated.salaryMin * 100_000) : undefined;
    const salaryMaxRupees =
      generated.salaryMax != null ? Math.round(generated.salaryMax * 100_000) : undefined;

    const sections = (generated.sections ?? []).map((s) => ({
      ...s,
      id: nanoid(8),
    }));

    return jsonSuccess({
      rawText: generated.description ?? "",
      metadata: {
        title: generated.titleNormalised,
        location: generated.location || "",
        roleFunction: generated.roleFunction || undefined,
        seniorityLevel: generated.seniorityLevel || undefined,
        remoteAllowed: generated.remoteAllowed ?? false,
        compensationMin: salaryMinRupees,
        compensationMax: salaryMaxRupees,
        experienceMin: generated.experienceMin,
        experienceMax: generated.experienceMax,
        summary: generated.summary,
      },
      sections,
    });
  } catch (err) {
    return handleApiError(err, "Failed to generate job description", {
      route: "POST /api/jobs/generate-jd",
    });
  }
}
