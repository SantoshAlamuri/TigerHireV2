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
  listCampaigns,
  replaceCampaignJobs,
  type ReferralCampaignAudienceFilter,
  type ReferralCampaignObjective,
} from "@/lib/referrers/campaigns";
import { isMissingTableError } from "@/lib/settings/error-utils";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;

function parsePaginationParams(url: URL) {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  const offset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return { error: "Invalid limit: expected an integer >= 1" as const };
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return { error: "Invalid offset: expected an integer >= 0" as const };
  }

  return {
    limit: Math.min(limit, MAX_LIMIT),
    offset: Math.min(offset, MAX_OFFSET),
  };
}

const createCampaignSchema = z.object({
  name: z.string().trim().min(3).max(140),
  objective: z.enum(["more_referrals", "urgent_role_fill"]).default("more_referrals"),
  audienceFilter: z
    .enum(["all_referrers", "org_verified_only", "city_match"])
    .default("all_referrers"),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  jobIds: z.array(z.string().uuid()).min(1).max(20),
});

const REFERRAL_CAMPAIGN_SELECT_COLUMNS =
  "id, organisation_id, name, objective, audience_filter, starts_at, ends_at, status, launched_at, ended_at, created_by, updated_by, created_at, updated_at";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!assertCanManageReferralCampaigns(ctx.role)) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const pagination = parsePaginationParams(new URL(request.url));
    if ("error" in pagination) return jsonError(String(pagination.error), 400);
    const payload = await listCampaigns(admin, ctx.organisationId, pagination).catch((err) => {
      if (isMissingTableError(err)) {
        return {
          campaigns: [],
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total: 0,
            hasMore: false,
          },
          warning: "Referral campaigns are not available in this environment yet.",
        };
      }
      throw err;
    });
    return jsonSuccess(payload);
  } catch (err) {
    return handleApiError(err, "Failed to list referral campaigns", {
      route: "GET /api/referral-campaigns",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!assertCanManageReferralCampaigns(ctx.role)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/referral-campaigns");
    if (errorResponse) return errorResponse;
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const payload = parsed.data;
    const insertRow = {
      organisation_id: ctx.organisationId,
      name: payload.name,
      objective: payload.objective as ReferralCampaignObjective,
      audience_filter: payload.audienceFilter as ReferralCampaignAudienceFilter,
      status: "draft",
      starts_at: payload.startsAt ?? null,
      ends_at: payload.endsAt ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: campaign, error: insErr } = await admin
      .from("referral_campaigns")
      .insert(insertRow)
      .select(REFERRAL_CAMPAIGN_SELECT_COLUMNS)
      .single();
    if (insErr) {
      if (isMissingTableError(insErr)) {
        return jsonError(
          "Referral campaigns are not available in this environment yet. Please run the latest migrations.",
          503,
        );
      }
      throw insErr;
    }
    if (!campaign) {
      throw new Error("Failed to create campaign");
    }

    await replaceCampaignJobs(admin, campaign.id as string, ctx.organisationId, payload.jobIds);

    return jsonSuccess({
      campaign,
      message: "Referral campaign created",
    });
  } catch (err) {
    return handleApiError(err, "Failed to create referral campaign", {
      route: "POST /api/referral-campaigns",
    });
  }
}
