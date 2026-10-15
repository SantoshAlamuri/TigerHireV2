export const maxDuration = 120;

import { NextRequest } from "next/server";
import { z } from "zod";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_HYBRID_V2 } from "@/lib/fitscore/hybrid/constants";
import { requireTryoutAuth } from "@/lib/tryout/auth";
import { createTryoutJobWithJdBase } from "@/lib/tryout/jd-base";
import {
  tryoutCsrfGuard,
  tryoutError,
  tryoutErrorMessage,
  tryoutJson,
  tryoutPreflight,
} from "@/lib/tryout/route-helpers";

const generateSchema = z.object({
  jd_text: z.string().min(50, "Paste at least 50 characters of job description text."),
  title: z.string().trim().min(2).max(120).optional(),
});

export async function OPTIONS(request: NextRequest) {
  return tryoutPreflight(request) ?? tryoutJson(request, {}, 204);
}

export async function POST(request: NextRequest) {
  const preflight = tryoutPreflight(request);
  if (preflight) return preflight;
  const csrf = tryoutCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { ctx, error } = await requireTryoutAuth(request);
    if (error || !ctx) return error!;

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return tryoutError(request, "Hybrid FitScore v2 is not enabled for the tryout org.", 403);
    }

    const body = await request.json().catch(() => null);
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((e) => e.message).join("; ");
      return tryoutError(request, messages, 422);
    }

    const result = await createTryoutJobWithJdBase({
      jdText: parsed.data.jd_text,
      title: parsed.data.title,
      userId: ctx.userId,
    });

    return tryoutJson(request, result.payload, 201);
  } catch (err) {
    return tryoutError(request, tryoutErrorMessage(err), 502);
  }
}
