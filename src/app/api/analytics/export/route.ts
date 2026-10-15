import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";
import {
  ALLOWED_METRICS,
  EXPORT_TIME_TO_HIRE_SELECT_FIELDS,
  EXPORT_PIPELINE_CONVERSION_SELECT_FIELDS,
  EXPORT_CANDIDATE_SOURCES_SELECT_FIELDS,
  EXPORT_RECENT_ACTIVITY_SELECT_FIELDS,
} from "./helpers";
import {
  exportOverview,
  exportOfferOutcomes,
  exportRecruiterProductivity,
  exportCostPerHire,
  exportBoardsOrDefault,
} from "./handlers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager", "agency")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId && !hasRole(ctx, "super_admin")) {
      return jsonError("No organisation context", 400);
    }

    const url = new URL(request.url);
    const metric = url.searchParams.get("metric") ?? "pipeline";
    const from = url.searchParams.get("from") ?? url.searchParams.get("dateFrom");
    const to = url.searchParams.get("to") ?? url.searchParams.get("dateTo");
    const jobId = url.searchParams.get("jobId");
    const scopedOrgId = ctx.organisationId;
    if (!ALLOWED_METRICS.has(metric)) return jsonError("Unsupported metric", 400);

    const supabase = await createSupabaseServerClient();

    let sourceTable = "";
    let sourceSelectFields = "";
    let orderBy = "";
    let ascending = false;
    switch (metric) {
      case "pipeline":
        sourceTable = "analytics_pipeline_conversion";
        sourceSelectFields = EXPORT_PIPELINE_CONVERSION_SELECT_FIELDS;
        orderBy = "total_applications";
        break;
      case "sources":
        sourceTable = "analytics_candidates_by_source";
        sourceSelectFields = EXPORT_CANDIDATE_SOURCES_SELECT_FIELDS;
        orderBy = "candidate_count";
        break;
      case "time_to_hire":
        sourceTable = "analytics_time_to_hire";
        sourceSelectFields = EXPORT_TIME_TO_HIRE_SELECT_FIELDS;
        orderBy = "avg_days_to_hire";
        ascending = true;
        break;
      case "activity":
        sourceTable = "analytics_recent_activity";
        sourceSelectFields = EXPORT_RECENT_ACTIVITY_SELECT_FIELDS;
        orderBy = "event_at";
        break;
      case "boards":
        sourceTable = "job_distributions";
        orderBy = "pushed_at";
        break;
      case "overview":
        sourceTable = "";
        orderBy = "";
        break;
      case "offer_outcomes":
        sourceTable = "offers";
        orderBy = "created_at";
        break;
      case "recruiter_productivity":
        sourceTable = "profiles";
        orderBy = "created_at";
        break;
      case "cost_per_hire":
        sourceTable = "platform_cost_events";
        orderBy = "occurred_at";
        break;
      default:
        sourceTable = "analytics_pipeline_conversion";
        sourceSelectFields = EXPORT_PIPELINE_CONVERSION_SELECT_FIELDS;
        orderBy = "total_applications";
    }

    const handlerParams = {
      supabase,
      ctx,
      metric,
      from,
      to,
      jobId,
      scopedOrgId,
      sourceTable,
      sourceSelectFields,
      orderBy,
      ascending,
    };

    if (metric === "overview") return exportOverview(handlerParams);
    if (metric === "offer_outcomes") return exportOfferOutcomes(handlerParams);
    if (metric === "recruiter_productivity") return exportRecruiterProductivity(handlerParams);
    if (metric === "cost_per_hire") return exportCostPerHire(handlerParams);
    return exportBoardsOrDefault(handlerParams);
  } catch (err) {
    return handleApiError(err, "Failed to export analytics CSV", {
      route: "GET /api/analytics/export",
    });
  }
}
