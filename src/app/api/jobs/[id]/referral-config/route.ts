import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  getTenantScopedClient,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { ForbiddenError } from "@/lib/tenancy/tenant-scoped-client";
import { validateOrigin } from "@/lib/security/csrf";
import { jobReferralConfigBodySchema } from "@/lib/validations/job-referral-config";
import { invalidateJobCache } from "@/lib/redis/job-cache";
import { JobService } from "@/lib/services/JobService";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter")) {
      return jsonError("Forbidden", 403);
    }

    const { id: jobId } = await params;
    const db = await getTenantScopedClient(ctx);
    let jobExists = false;
    try {
      jobExists = await db.assertJobAccess(jobId);
    } catch (error) {
      if (error instanceof ForbiddenError) return jsonError("Forbidden", 403);
      throw error;
    }
    if (!jobExists) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("job_referral_config")
      .select(
        "job_id, direct_bonus_amount, parent_bonus_amount, candidate_referrer_bonus_amount, vouch_bonus_amount, bonus_trigger, candidate_referrer_enabled, bonus_notes, bonus_currency",
      )
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) return jsonError("Failed to load referral config.", 500);
    return jsonSuccess({ config: data ?? null });
  } catch (err) {
    return handleApiError(err, "Failed to load referral config", {
      route: "GET /api/jobs/[id]/referral-config",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter")) {
      return jsonError("Forbidden", 403);
    }

    const { id: jobId } = await params;
    const parsedBody = await parseJsonBody(request, "PATCH /api/jobs/[id]/referral-config");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = jobReferralConfigBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const db = await getTenantScopedClient(ctx);
    let jobExists = false;
    try {
      jobExists = await db.assertJobAccess(jobId);
    } catch (error) {
      if (error instanceof ForbiddenError) return jsonError("Forbidden", 403);
      throw error;
    }
    if (!jobExists) return jsonError("Job not found", 404);

    const existing = await JobService.getById(db.raw, jobId);
    if (!existing) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const body = parsed.data;

    if (!body.enabled) {
      const { error: delErr } = await admin
        .from("job_referral_config")
        .delete()
        .eq("job_id", jobId);
      if (delErr) return jsonError("Failed to clear referral config.", 500);
      const agencyOrgId = hasRole(ctx, "agency") ? ctx.organisationId : undefined;
      await invalidateJobCache(
        jobId,
        existing.organisation_id ?? undefined,
        agencyOrgId ?? undefined,
      );
      return jsonSuccess({ config: null });
    }

    const row = {
      job_id: jobId,
      direct_bonus_amount: body.direct_bonus_amount,
      parent_bonus_amount: body.parent_bonus_amount,
      candidate_referrer_bonus_amount: body.candidate_referrer_bonus_amount,
      vouch_bonus_amount: body.vouch_bonus_amount,
      bonus_trigger: body.bonus_trigger,
      candidate_referrer_enabled: body.candidate_referrer_enabled,
      bonus_notes: body.bonus_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upErr } = await admin
      .from("job_referral_config")
      .upsert(row, { onConflict: "job_id" })
      .select(
        "job_id, direct_bonus_amount, parent_bonus_amount, candidate_referrer_bonus_amount, vouch_bonus_amount, bonus_trigger, candidate_referrer_enabled, bonus_notes, bonus_currency",
      )
      .single();

    if (upErr) {
      const msg = upErr.message ?? "";
      if (msg.includes("candidate_referrer") || msg.includes("vouch_bonus")) {
        const legacyRow = {
          job_id: jobId,
          direct_bonus_amount: body.direct_bonus_amount,
          parent_bonus_amount: body.parent_bonus_amount,
          bonus_trigger: body.bonus_trigger,
          bonus_notes: body.bonus_notes?.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { data: leg, error: legErr } = await admin
          .from("job_referral_config")
          .upsert(legacyRow, { onConflict: "job_id" })
          .select(
            "job_id, direct_bonus_amount, parent_bonus_amount, bonus_trigger, bonus_notes, bonus_currency",
          )
          .single();
        if (legErr) return jsonError("Failed to save referral config.", 500);
        const agencyOrgId = hasRole(ctx, "agency") ? ctx.organisationId : undefined;
        await invalidateJobCache(
          jobId,
          existing.organisation_id ?? undefined,
          agencyOrgId ?? undefined,
        );
        return jsonSuccess({ config: leg, partialSchema: true });
      }
      return jsonError("Failed to save referral config.", 500);
    }

    const agencyOrgId = hasRole(ctx, "agency") ? ctx.organisationId : undefined;
    await invalidateJobCache(
      jobId,
      existing.organisation_id ?? undefined,
      agencyOrgId ?? undefined,
    );
    return jsonSuccess({ config: upserted });
  } catch (err) {
    return handleApiError(err, "Failed to save referral config", {
      route: "PATCH /api/jobs/[id]/referral-config",
    });
  }
}
