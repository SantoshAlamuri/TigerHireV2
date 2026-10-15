import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import {
  MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY,
  MAX_WHATSAPP_SCREENING_QUESTIONS_POST_SHORTLIST,
  fetchWhatsAppScreeningSetup,
  saveWhatsAppScreeningQuestions,
} from "@/lib/screening/whatsapp-screening-setup";
import type { PrescreenStage } from "@/lib/prescreen/types";

const READER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "hiring_manager",
  "agency",
] as const;

const WRITER_ROLES = ["super_admin", "leadership", "recruiter"] as const;

const saveSchema = z
  .object({
    stage: z.enum(["apply", "post_shortlist"]),
    questions: z
      .array(z.string().min(3).max(500))
      .min(1)
      .max(MAX_WHATSAPP_SCREENING_QUESTIONS_POST_SHORTLIST),
  })
  .strict();

/**
 * GET /api/jobs/[id]/whatsapp-screening
 * Load WhatsApp screening question setup for this job.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...READER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const payload = await fetchWhatsAppScreeningSetup(admin, jobId, job.organisation_id);
    return jsonSuccess(payload);
  } catch (err) {
    return handleApiError(err, "Failed to load WhatsApp screening setup", {
      route: "GET /api/jobs/[id]/whatsapp-screening",
    });
  }
}

/**
 * PUT /api/jobs/[id]/whatsapp-screening
 * Save up to 5 yes/no WhatsApp screening questions for this job.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...WRITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const parsedBody = await parseJsonBody(request, "PUT /api/jobs/[id]/whatsapp-screening");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = saveSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const current = await fetchWhatsAppScreeningSetup(admin, jobId, job.organisation_id);
    if (!current.whatsappEnabled) {
      return jsonError(
        "WhatsApp screening is off for this organisation. Enable it under Recruit → Settings → Screening.",
        400,
      );
    }
    if (!current.jdBaseReady) {
      return jsonError("Complete Scoring setup (Ideal Profile) on this job first.", 400);
    }

    await saveWhatsAppScreeningQuestions(
      admin,
      jobId,
      parsed.data.questions,
      parsed.data.stage as PrescreenStage,
    );
    const payload = await fetchWhatsAppScreeningSetup(admin, jobId, job.organisation_id);
    return jsonSuccess(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save WhatsApp screening questions";
    return handleApiError(err, msg, {
      route: "PUT /api/jobs/[id]/whatsapp-screening",
    });
  }
}
