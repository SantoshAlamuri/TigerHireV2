import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import {
  assertCanManageReferralCampaigns,
  createCampaignEvent,
  getCampaignDetail,
  replaceCampaignJobs,
  type ReferralCampaignStatus,
} from "@/lib/referrers/campaigns";

const patchCampaignSchema = z.object({
  name: z.string().trim().min(3).max(140).optional(),
  objective: z.enum(["more_referrals", "urgent_role_fill"]).optional(),
  audienceFilter: z.enum(["all_referrers", "org_verified_only", "city_match"]).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
  jobIds: z.array(z.string().uuid()).min(1).max(20).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!assertCanManageReferralCampaigns(ctx.role)) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const detail = await getCampaignDetail(admin, id, ctx.organisationId);
    if (!detail) return jsonError("Campaign not found", 404);

    return jsonSuccess(detail);
  } catch (err) {
    return handleApiError(err, "Failed to fetch referral campaign", {
      route: "GET /api/referral-campaigns/[id]",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!assertCanManageReferralCampaigns(ctx.role)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "PATCH /api/referral-campaigns/[id]",
    );
    if (errorResponse) return errorResponse;
    const parsed = patchCampaignSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const payload = parsed.data;
    const admin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const updateRow: Record<string, unknown> = {
      updated_at: nowIso,
      updated_by: ctx.userId,
    };
    if (payload.name !== undefined) updateRow.name = payload.name;
    if (payload.objective !== undefined) updateRow.objective = payload.objective;
    if (payload.audienceFilter !== undefined) updateRow.audience_filter = payload.audienceFilter;
    if (payload.startsAt !== undefined) updateRow.starts_at = payload.startsAt;
    if (payload.endsAt !== undefined) updateRow.ends_at = payload.endsAt;
    if (payload.status !== undefined) updateRow.status = payload.status;
    if (payload.status === "ended") updateRow.ended_at = nowIso;
    if (payload.status === "active") {
      updateRow.launched_at = nowIso;
      updateRow.ended_at = null;
    }
    if (payload.status === "paused" || payload.status === "draft") {
      updateRow.ended_at = null;
    }

    const { data: updated, error: updErr } = await admin
      .from("referral_campaigns")
      .update(updateRow)
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .select(
        "id, organisation_id, name, objective, audience_filter, starts_at, ends_at, status, launched_at, ended_at, created_by, updated_by, created_at, updated_at",
      )
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) return jsonError("Campaign not found", 404);

    if (payload.jobIds) {
      await replaceCampaignJobs(admin, id, ctx.organisationId, payload.jobIds);
    }

    if (payload.status) {
      const eventMap: Partial<Record<ReferralCampaignStatus, "paused" | "resumed" | "ended">> = {
        paused: "paused",
        active: "resumed",
        ended: "ended",
      };
      const eventType = eventMap[payload.status];
      if (eventType) {
        await createCampaignEvent(admin, {
          campaignId: id,
          organisationId: ctx.organisationId,
          eventType,
          eventPayload: { updatedBy: ctx.userId },
        });
      }
    }

    const detail = await getCampaignDetail(admin, id, ctx.organisationId);
    return jsonSuccess({
      ...(detail ?? { campaign: updated }),
      message: "Referral campaign updated",
    });
  } catch (err) {
    return handleApiError(err, "Failed to update referral campaign", {
      route: "PATCH /api/referral-campaigns/[id]",
    });
  }
}
