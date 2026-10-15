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
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getApplicationFunnel, getSourceSummary } from "@/lib/analytics/application-funnel";
import { logger } from "@/lib/observability/logger";
import {
  analyticsRangeQuerySchema,
  normalizeAnalyticsRangeRaw,
} from "@/lib/validations/analytics-range";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

const ROLES = ["super_admin", "leadership", "recruiter", "agency", "hiring_manager"] as const;

/**
 * GET /api/analytics/application-funnel
 * Application funnel + source breakdown for the recruiter org (A4).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: `analytics-application-funnel:${ctx.userId}`,
      limit: 60,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests", 429);
    }

    if (!ctx.organisationId && !hasRole(ctx, "super_admin")) {
      return jsonError("No organisation context", 400);
    }

    const url = new URL(request.url);
    const raw = normalizeAnalyticsRangeRaw({
      jobId: url.searchParams.get("jobId"),
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
    });
    const parsed = analyticsRangeQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
    }

    const supabase = await createSupabaseServerClient();
    const orgId = ctx.organisationId;

    if (!orgId) {
      logger.warn("GET /api/analytics/application-funnel: super_admin without org not supported");
      return jsonError("Select an organisation context for this report", 400);
    }

    let hmJobIdsForFilters: string[] | null = null;
    if (hasRole(ctx, "hiring_manager")) {
      const hmJobIds = await listHiringManagerJobIds(supabase, orgId, ctx.userId);
      if (parsed.data.jobId && !hmJobIds.includes(parsed.data.jobId)) {
        return jsonError("Access denied to this job", 403);
      }
      if (hmJobIds.length === 0) {
        return jsonSuccess({
          funnel: [],
          sources: [],
          generatedAt: new Date().toISOString(),
        });
      }
      hmJobIdsForFilters = hmJobIds;
    }

    const filters: {
      jobId?: string;
      jobIds?: string[];
      dateFrom?: string;
      dateTo?: string;
    } = {
      jobId: parsed.data.jobId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
    };
    if (hmJobIdsForFilters && !parsed.data.jobId) {
      filters.jobIds = hmJobIdsForFilters;
    }

    const [funnel, sources] = await Promise.all([
      getApplicationFunnel(supabase, orgId, filters),
      getSourceSummary(supabase, orgId, filters),
    ]);

    return jsonSuccess({
      funnel,
      sources,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch application funnel analytics", {
      route: "GET /api/analytics/application-funnel",
    });
  }
}
