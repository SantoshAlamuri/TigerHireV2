/** CV parse + hybrid score can exceed 60s on large resumes. */
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { z } from "zod";
import { inferMimeFromName } from "@/lib/services/extract-document-text";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_HYBRID_V2 } from "@/lib/fitscore/hybrid/constants";
import { requireTryoutAuth } from "@/lib/tryout/auth";
import { scoreTryoutCv, TryoutCvLimitError } from "@/lib/tryout/score-cv";
import {
  tryoutCsrfGuard,
  tryoutError,
  tryoutJson,
  tryoutPreflight,
} from "@/lib/tryout/route-helpers";

const ALLOWED_TYPES = ["application/pdf"];

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

    const formData = await request.formData();
    const file = formData.get("file");
    const jobIdRaw = formData.get("jobId");
    const jobIdParsed = z.string().uuid().safeParse(jobIdRaw);
    if (!jobIdParsed.success) {
      return tryoutError(request, "Valid jobId is required", 422);
    }
    if (!(file instanceof File)) {
      return tryoutError(request, "PDF file is required", 400);
    }
    if (file.size > MAX_STANDARD_UPLOAD_BYTES) {
      return tryoutError(request, "File too large. Maximum size is 10 MB.", 400);
    }
    const effectiveType = (file.type && file.type.trim()) || inferMimeFromName(file.name) || "";
    if (!ALLOWED_TYPES.includes(effectiveType)) {
      return tryoutError(request, "Invalid file type. PDF only.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return tryoutError(request, "File is empty", 400);

    const result = await scoreTryoutCv({
      jobId: jobIdParsed.data,
      fileBuffer: buffer,
      fileName: file.name,
      contentType: effectiveType,
    });

    return tryoutJson(request, result, 201);
  } catch (err) {
    if (err instanceof TryoutCvLimitError) {
      return tryoutError(request, err.message, 429);
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("jd_base_not_approved") || msg.includes("not approved")) {
      return tryoutError(request, "Approve the scoring blueprint before uploading CVs.", 428);
    }
    return tryoutError(request, msg, 502);
  }
}
