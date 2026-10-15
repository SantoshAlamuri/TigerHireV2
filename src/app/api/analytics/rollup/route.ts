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
import { loadAnalyticsRollup, AnalyticsRollupError } from "@/lib/v2/analytics-rollup";

const READER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/analytics/rollup?from=&to=
 *
 * The application rows the analytics screen derives from, for the whole period
 * rather than the first page of them. The screen previously read
 * `/api/applications?limit=100` and computed org funnel conversion, source of
 * hire, rejection mix and time-to-decision from those hundred rows — figures
 * that were wrong in a way nothing on the page disclosed.
 *
 * `from`/`to` use the same contract as the other analytics endpoints
 * (`periodParams` in lib/v2/analytics-fusion), so the period picker now reaches
 * these numbers too; it previously only reached the v1 endpoints.
 *
 * Scoping is through `jobs.organisation_id` because applications carry no org
 * column of their own, and a hiring manager is restricted to the jobs they own
 * — the same boundary `/api/analytics` enforces.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...READER_ROLES)) return jsonError("Forbidden", 403);
    // Unlike the aggregate metrics, this walks rows — a super_admin with no org
    // selected would page every tenant's applications into one response.
    if (!ctx.organisationId) {
      return jsonError("Select an organisation context for this report", 400);
    }

    const url = new URL(request.url);
    const db = await createSupabaseServerClient();

    const rollup = await loadAnalyticsRollup(db, {
      orgId: ctx.organisationId,
      hiringManagerId: hasRole(ctx, "hiring_manager") ? ctx.userId : null,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    return jsonSuccess(rollup);
  } catch (err) {
    if (err instanceof AnalyticsRollupError) {
      return jsonError("Failed to load analytics rollup", 500);
    }
    return handleApiError(err, "Failed to load analytics rollup", {
      route: "GET /api/analytics/rollup",
    });
  }
}
