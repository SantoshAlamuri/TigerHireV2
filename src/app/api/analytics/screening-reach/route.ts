import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { screeningReach, type SessionRow } from "@/lib/v2/screening-reach";

const READER_ROLES = ["super_admin", "leadership", "recruiter"] as const;

/**
 * GET /api/analytics/screening-reach
 *
 * Supplies the denominator for candidate reply rate: how many candidates were
 * actually sent screening questions. Nothing else exposed it, so the tile was
 * fed a hardcoded zero and reported "no screening messages sent yet" on an org
 * that had sent thousands.
 *
 * Scoped through jobs.organisation_id because prescreen_sessions carries no org
 * column of its own — reading it unscoped would cross tenants.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...READER_ROLES)) return jsonError("Forbidden", 403);
    if (!ctx.organisationId && !hasRole(ctx, "super_admin")) {
      return jsonError("No organisation context", 400);
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("prescreen_sessions")
      .select("questions_sent_at, completed_at, declined_at, jobs!inner(organisation_id)")
      .limit(5000);

    if (ctx.organisationId) {
      query = query.eq("jobs.organisation_id", ctx.organisationId);
    }
    // Windowed on when the questions went out, so the rate matches the period
    // the rest of the screen is reporting.
    if (from) query = query.gte("questions_sent_at", from);
    if (to) query = query.lt("questions_sent_at", to);

    const { data, error } = await query;
    if (error) {
      logger.error("Screening reach query failed", { error: String(error) });
      return jsonError("Failed to fetch screening reach", 500);
    }

    return jsonSuccess({ reach: screeningReach((data ?? []) as SessionRow[]) });
  } catch (err) {
    return handleApiError(err, "Failed to fetch screening reach", {
      route: "GET /api/analytics/screening-reach",
    });
  }
}
