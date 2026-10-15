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
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { fetchJobScreeningReview } from "@/lib/screening/fetch-job-screening-review";
import { ApplicationRepository } from "@/lib/repositories/ApplicationRepository";
import { sendTemplateMessage } from "@/lib/services/whatsapp";
import { getOrgDisplayName } from "@/lib/screening/org-whatsapp-screening";
import { logger } from "@/lib/observability/logger";

const READER_ROLES = ["super_admin", "leadership", "recruiter", "agency"] as const;
const WRITER_ROLES = ["super_admin", "leadership", "recruiter", "agency"] as const;

const bulkRejectSchema = z
  .object({
    applicationIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();

const REJECTABLE_STATUSES = new Set(["applied", "viewed", "shortlisted"]);

/**
 * GET /api/jobs/[id]/screening-review
 * Grid of applications with FitScore, gate status, and screening / prescreen answers.
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
    const payload = await fetchJobScreeningReview(admin, jobId);
    return jsonSuccess(payload);
  } catch (err) {
    return handleApiError(err, "Failed to load screening review", {
      route: "GET /api/jobs/[id]/screening-review",
    });
  }
}

/**
 * POST /api/jobs/[id]/screening-review
 * Bulk reject applications from the screening review table.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...WRITER_ROLES)) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "screening-review-bulk",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const { id: jobId } = await params;
    const parsedBody = await parseJsonBody(request, "POST /api/jobs/[id]/screening-review");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = bulkRejectSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const { data: apps, error } = await admin
      .from("applications")
      .select("id, status, candidates(name, full_name, phone)")
      .eq("job_id", jobId)
      .in("id", parsed.data.applicationIds);
    if (error) throw error;

    const { data: jobRow } = await admin.from("jobs").select("title").eq("id", jobId).maybeSingle();
    const jobTitle = String(jobRow?.title ?? "this role");
    const companyName = job.organisation_id
      ? await getOrgDisplayName(admin, job.organisation_id)
      : "the hiring team";

    let updated = 0;
    let notified = 0;
    for (const row of apps ?? []) {
      const status = String(row.status ?? "");
      if (!REJECTABLE_STATUSES.has(status)) continue;
      await ApplicationRepository.updateStatus(supabase, row.id as string, { status: "rejected" });
      updated += 1;

      // Best-effort WhatsApp rejection via the approved UTILITY template
      // th_not_selected (deliverable to cold numbers, unlike marketing templates).
      const candidate = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates;
      const phone = (candidate as { phone?: string | null } | null)?.phone?.trim();
      if (phone) {
        const rawName =
          (candidate as { full_name?: string | null; name?: string | null } | null)?.full_name ??
          (candidate as { name?: string | null } | null)?.name ??
          "";
        const firstName = rawName.trim().split(/\s+/)[0] || "there";
        const sent = await sendTemplateMessage({
          phoneNumber: phone,
          templateName: "th_not_selected",
          languageCode: "en",
          bodyParams: [firstName, jobTitle, companyName],
          applicationId: row.id as string,
        });
        if (sent.success) {
          notified += 1;
        } else {
          logger.warn("[screening-review] rejection WhatsApp failed", {
            applicationId: row.id,
            error: sent.error,
          });
        }
      }
    }

    return jsonSuccess({ updated, notified });
  } catch (err) {
    return handleApiError(err, "Failed to reject applications", {
      route: "POST /api/jobs/[id]/screening-review",
    });
  }
}
