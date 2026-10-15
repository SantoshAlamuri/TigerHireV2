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
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";
import { getFitScoreAnalytics } from "@/lib/analytics/fitscore-analytics";
import {
  getAnalyticsKpiTrends,
  getAnalyticsKpiSeries,
  resolvePeriodDays,
  resolveCustomPeriod,
} from "@/lib/analytics/kpi-trends";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/** Known `metric` query values; reject anything else so arbitrary strings never hit the default/overview SQL path. */
const ANALYTICS_METRICS = new Set([
  "time_to_hire",
  "pipeline",
  "funnel",
  "sources",
  "activity",
  "boards",
  "offer_outcomes",
  "recruiter_productivity",
  "cost_per_hire",
  "fitscore",
  "overview",
]);

const ANALYTICS_CACHE_TTL_MS = 20_000;
const analyticsResponseCache = new Map<string, { at: number; value: unknown }>();
const TIME_TO_HIRE_SELECT_FIELDS =
  "organisation_id, job_id, job_title, avg_days_to_hire, min_days, max_days, hired_count";
const PIPELINE_CONVERSION_SELECT_FIELDS =
  "organisation_id, job_id, job_title, total_applications, viewed, shortlisted, hired, rejected, withdrawn, hire_rate_pct";
const CANDIDATE_SOURCES_SELECT_FIELDS = "organisation_id, source, candidate_count";
const RECENT_ACTIVITY_SELECT_FIELDS =
  "organisation_id, event_id, job_id, event_type, event_detail, job_title, event_at";

type PipelinePreviewRow = {
  id: string;
  interview_scheduled_at: string | null;
  interview_outcome: string | null;
  candidates?: { name?: string | null } | Array<{ name?: string | null }> | null;
  jobs?: { title?: string | null } | Array<{ title?: string | null }> | null;
};

function firstJoinedRecord<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapPipelinePreviewRow(row: PipelinePreviewRow) {
  const candidate = firstJoinedRecord(row.candidates ?? null);
  const job = firstJoinedRecord(row.jobs ?? null);

  return {
    id: row.id,
    interviewScheduledAt: row.interview_scheduled_at,
    interviewOutcome: row.interview_outcome,
    candidateName: typeof candidate?.name === "string" ? candidate.name : null,
    jobTitle: typeof job?.title === "string" ? job.title : "Unknown",
  };
}

/** Optional client-provided local calendar day for "tomorrow" interview counts (ISO bounds). */
function parseClientTomorrowWindow(
  startStr: string | null,
  endStr: string | null,
  now: Date,
): { start: Date; end: Date } | null {
  if (!startStr?.trim() || !endStr?.trim()) return null;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (!(end.getTime() > start.getTime())) return null;
  const spanMs = end.getTime() - start.getTime();
  if (spanMs > 48 * 60 * 60 * 1000) return null;
  const slackBefore = 24 * 60 * 60 * 1000;
  const slackAfter = 72 * 60 * 60 * 1000;
  if (start.getTime() < now.getTime() - slackBefore) return null;
  if (end.getTime() > now.getTime() + slackAfter) return null;
  return { start, end };
}

/**
 * GET /api/analytics
 * Recruiter/org analytics dashboard: time-to-hire, pipeline conversion,
 * candidates by source, and recent activity.
 * Query params: ?metric=time_to_hire|pipeline|sources|activity|overview
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const supabase = await createSupabaseServerClient();
    const url = new URL(request.url);
    const metricParam = url.searchParams.get("metric");
    const metric = metricParam === null || metricParam === "" ? "overview" : metricParam;
    if (!ANALYTICS_METRICS.has(metric)) {
      return jsonError("Invalid metric parameter", 400);
    }
    const from = url.searchParams.get("from") ?? url.searchParams.get("dateFrom");
    const to = url.searchParams.get("to") ?? url.searchParams.get("dateTo");
    const jobId = url.searchParams.get("jobId");
    const orgId = ctx.organisationId;
    const cacheKey = `${ctx.userId}:${orgId ?? "no-org"}:${url.search}`;
    const cached = analyticsResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ANALYTICS_CACHE_TTL_MS) {
      return jsonSuccess(cached.value);
    }

    if (!orgId && !hasRole(ctx, "super_admin")) {
      return jsonError("No organisation context", 400);
    }

    const orgFilter = hasRole(ctx, "super_admin") && !orgId ? {} : { organisation_id: orgId! };

    const isHiringManager = hasRole(ctx, "hiring_manager");
    let hmJobIds: string[] = [];
    if (isHiringManager && orgFilter.organisation_id) {
      hmJobIds = await listHiringManagerJobIds(supabase, orgFilter.organisation_id, ctx.userId);
    }

    switch (metric) {
      case "time_to_hire": {
        if (isHiringManager && hmJobIds.length === 0) {
          const value = { time_to_hire: [] };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        let query = supabase
          .from("analytics_time_to_hire")
          .select(TIME_TO_HIRE_SELECT_FIELDS)
          .order("avg_days_to_hire", { ascending: true });
        if (orgFilter.organisation_id) {
          query = query.eq("organisation_id", orgFilter.organisation_id);
        }
        if (isHiringManager) {
          query = query.in("job_id", hmJobIds);
        }
        if (jobId) {
          if (isHiringManager && !hmJobIds.includes(jobId)) {
            return jsonError("Access denied to this job", 403);
          }
          query = query.eq("job_id", jobId);
        }
        const { data, error } = await query;
        if (error) {
          logger.error("Analytics time_to_hire failed", {
            error: String(error),
          });
          return jsonError("Failed to fetch time-to-hire data", 500);
        }
        const value = { time_to_hire: data ?? [] };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "pipeline": {
        if (isHiringManager && hmJobIds.length === 0) {
          const value = { pipeline: [] };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        let query = supabase
          .from("analytics_pipeline_conversion")
          .select(PIPELINE_CONVERSION_SELECT_FIELDS)
          .order("total_applications", { ascending: false });
        if (orgFilter.organisation_id) {
          query = query.eq("organisation_id", orgFilter.organisation_id);
        }
        if (isHiringManager) {
          query = query.in("job_id", hmJobIds);
        }
        if (jobId) {
          if (isHiringManager && !hmJobIds.includes(jobId)) {
            return jsonError("Access denied to this job", 403);
          }
          query = query.eq("job_id", jobId);
        }
        const { data, error } = await query;
        if (error) {
          logger.error("Analytics pipeline failed", { error: String(error) });
          return jsonError("Failed to fetch pipeline data", 500);
        }
        const value = { pipeline: data ?? [] };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "funnel": {
        if (!jobId) {
          return jsonError("jobId is required for funnel metric", 400);
        }
        if (isHiringManager && !hmJobIds.includes(jobId)) {
          return jsonError("Access denied to this job", 403);
        }
        const { data: appRows, error: aErr } = await supabase
          .from("applications")
          .select("status")
          .eq("job_id", jobId);
        if (aErr) {
          return jsonError("Failed to load applications for funnel", 500);
        }
        const byStatus: Record<string, number> = {};
        for (const r of appRows ?? []) {
          const s = (r as { status?: string }).status ?? "unknown";
          byStatus[s] = (byStatus[s] ?? 0) + 1;
        }
        const total = (appRows ?? []).length;
        const value = {
          jobId,
          total,
          byStatus,
          /**
           * Approximate launch funnel: applied+ → viewed/shortlisted → offer signal via hired
           * (extend when offer stage is modelled in SQL).
           */
          rollup: {
            newApps: (byStatus.applied ?? 0) + (byStatus.viewed ?? 0) + (byStatus.shortlisted ?? 0),
            closed: (byStatus.rejected ?? 0) + (byStatus.hired ?? 0) + (byStatus.withdrawn ?? 0),
            hired: byStatus.hired ?? 0,
          },
        };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess({ funnel: value });
      }

      case "sources": {
        if (isHiringManager) {
          const value = { sources: [] };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        let query = supabase
          .from("analytics_candidates_by_source")
          .select(CANDIDATE_SOURCES_SELECT_FIELDS)
          .order("candidate_count", { ascending: false });
        if (orgFilter.organisation_id) {
          query = query.eq("organisation_id", orgFilter.organisation_id);
        }
        const { data, error } = await query;
        if (error) {
          logger.error("Analytics sources failed", { error: String(error) });
          return jsonError("Failed to fetch source data", 500);
        }
        const value = { sources: data ?? [] };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "activity": {
        if (isHiringManager) {
          const value = { activity: [] };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        let query = supabase
          .from("analytics_recent_activity")
          .select(RECENT_ACTIVITY_SELECT_FIELDS)
          .order("event_at", { ascending: false })
          .limit(50);
        if (orgFilter.organisation_id) {
          query = query.eq("organisation_id", orgFilter.organisation_id);
        }
        if (from) query = query.gte("event_at", from);
        if (to) query = query.lte("event_at", to);
        const { data, error } = await query;
        if (error) {
          // Graceful fallback: activity feed should not take down the entire recruiter overview.
          logger.warn("Analytics activity query failed, returning empty feed", {
            error: String(error),
          });
          const value = { activity: [] as Array<Record<string, unknown>> };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        const value = { activity: data ?? [] };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "boards": {
        if (isHiringManager && hmJobIds.length === 0) {
          const value = { boards: [], distributions: [] };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        // Job board distribution summary: aggregate every matching row (no silent `.limit`).
        const buildDistributionsQuery = () => {
          let q = supabase
            .from("job_distributions")
            .select(
              "id, job_id, board, status, pushed_at, removed_at, error, jobs!inner(organisation_id, title)",
            )
            .order("id", { ascending: true });
          if (orgFilter.organisation_id) {
            q = q.eq("jobs.organisation_id", orgFilter.organisation_id);
          }
          if (isHiringManager) {
            q = q.in("job_id", hmJobIds);
          }
          if (from) q = q.gte("pushed_at", from);
          if (to) q = q.lte("pushed_at", to);
          return q;
        };

        const { data: distRows, error } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
          buildDistributionsQuery().range(rangeFrom, rangeTo),
        );
        if (error) {
          logger.error("Analytics boards failed", { error: String(error) });
          return jsonError("Failed to fetch board data", 500);
        }

        const boardMap: Record<
          string,
          { board: string; pushed: number; failed: number; removed: number; active: number }
        > = {};
        for (const row of distRows) {
          const b = row.board;
          if (!boardMap[b]) boardMap[b] = { board: b, pushed: 0, failed: 0, removed: 0, active: 0 };
          if (row.status === "pushed") {
            boardMap[b].pushed++;
            boardMap[b].active++;
          } else if (row.status === "failed") {
            boardMap[b].failed++;
          } else if (row.status === "removed") {
            boardMap[b].removed++;
          }
        }

        const previewSource = [...distRows].sort((a, b) => {
          const ta = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
          const tb = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
          return tb - ta;
        });

        const value = {
          boards: Object.values(boardMap),
          distributions: previewSource.slice(0, 50).map((d) => ({
            id: d.id,
            jobId: d.job_id,
            board: d.board,
            status: d.status,
            pushedAt: d.pushed_at,
            removedAt: d.removed_at,
            error: d.error,
            jobTitle: (d.jobs as unknown as { title?: string })?.title ?? "Unknown",
          })),
        };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "offer_outcomes": {
        if (isHiringManager && hmJobIds.length === 0) {
          const value = {
            offer_outcomes: {
              total_offers: 0,
              sent_count: 0,
              viewed_count: 0,
              accepted_count: 0,
              declined_count: 0,
              expired_count: 0,
              awaiting_response_count: 0,
              acceptance_rate: null,
              drop_off_rate: null,
              response_rate: null,
            },
          };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }

        const buildOffersQuery = () => {
          let q = supabase
            .from("offers")
            .select(
              "id, status, signing_status, sent_at, first_viewed_at, signed_at, declined_at, expired_at, applications!inner(job_id, jobs!inner(organisation_id, hiring_manager_id))",
            );
          if (orgFilter.organisation_id) {
            q = q.eq("applications.jobs.organisation_id", orgFilter.organisation_id);
          }
          if (isHiringManager) {
            q = q.in("applications.job_id", hmJobIds);
          }
          if (jobId) {
            q = q.eq("applications.job_id", jobId);
          }
          if (from) q = q.gte("sent_at", from);
          if (to) q = q.lte("sent_at", to);
          return q.order("id", { ascending: true });
        };
        const { data: offerRows, error } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
          buildOffersQuery().range(rangeFrom, rangeTo),
        );
        if (error) {
          logger.error("Analytics offer_outcomes failed", { error: String(error) });
          return jsonError("Failed to fetch offer outcomes", 500);
        }

        const rows =
          (offerRows as Array<{
            status?: string | null;
            signing_status?: string | null;
            sent_at?: string | null;
            first_viewed_at?: string | null;
            signed_at?: string | null;
            declined_at?: string | null;
            expired_at?: string | null;
          }>) ?? [];
        const sent = rows.filter((row) => Boolean(row.sent_at)).length;
        const viewed = rows.filter((row) => Boolean(row.first_viewed_at)).length;
        const accepted = rows.filter(
          (row) =>
            Boolean(row.signed_at) || row.status === "accepted" || row.signing_status === "signed",
        ).length;
        const declined = rows.filter(
          (row) =>
            Boolean(row.declined_at) ||
            row.status === "declined" ||
            row.signing_status === "declined",
        ).length;
        const expired = rows.filter(
          (row) =>
            Boolean(row.expired_at) || row.status === "expired" || row.signing_status === "expired",
        ).length;
        const awaitingResponse = Math.max(sent - accepted - declined - expired, 0);

        const value = {
          offer_outcomes: {
            total_offers: rows.length,
            sent_count: sent,
            viewed_count: viewed,
            accepted_count: accepted,
            declined_count: declined,
            expired_count: expired,
            awaiting_response_count: awaitingResponse,
            acceptance_rate: sent > 0 ? accepted / sent : null,
            drop_off_rate: sent > 0 ? (declined + expired) / sent : null,
            response_rate: sent > 0 ? (accepted + declined) / sent : null,
          },
        };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "recruiter_productivity": {
        if (!orgFilter.organisation_id) {
          return jsonError("Select an organisation context for this report", 400);
        }
        if (isHiringManager) {
          const value = { recruiters: [] };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }

        const profileQuery = supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("organisation_id", orgFilter.organisation_id!)
          .in("role", ["recruiter", "leadership"]);
        const { data: profileRows, error: profileErr } = await profileQuery.limit(300);
        if (profileErr) {
          logger.error("Analytics recruiter_productivity profiles failed", {
            error: String(profileErr),
          });
          return jsonError("Failed to fetch recruiter productivity", 500);
        }

        const buildJobsQuery = () => {
          let q = supabase
            .from("jobs")
            .select("id, assigned_recruiter_id, created_by, organisation_id, created_at")
            .eq("organisation_id", orgFilter.organisation_id!);
          if (jobId) q = q.eq("id", jobId);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          return q.order("id", { ascending: true });
        };
        const { data: jobsRows, error: jobsErr } = await fetchAllSupabasePages(
          (rangeFrom, rangeTo) => buildJobsQuery().range(rangeFrom, rangeTo),
        );
        if (jobsErr) {
          logger.error("Analytics recruiter_productivity jobs failed", { error: String(jobsErr) });
          return jsonError("Failed to fetch recruiter productivity", 500);
        }

        const buildAppsQuery = () => {
          let q = supabase
            .from("applications")
            .select(
              "id, status, created_at, jobs!inner(id, organisation_id, assigned_recruiter_id, created_by)",
            )
            .eq("jobs.organisation_id", orgFilter.organisation_id!);
          if (jobId) q = q.eq("job_id", jobId);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          return q.order("id", { ascending: true });
        };
        const { data: appsRows, error: appsErr } = await fetchAllSupabasePages(
          (rangeFrom, rangeTo) => buildAppsQuery().range(rangeFrom, rangeTo),
        );
        if (appsErr) {
          logger.error("Analytics recruiter_productivity applications failed", {
            error: String(appsErr),
          });
          return jsonError("Failed to fetch recruiter productivity", 500);
        }

        const buildInterviewsQuery = () => {
          let q = supabase
            .from("pipeline_candidates")
            .select(
              "id, interview_scheduled_at, created_at, jobs!inner(id, organisation_id, assigned_recruiter_id, created_by)",
            )
            .eq("jobs.organisation_id", orgFilter.organisation_id!);
          if (jobId) q = q.eq("job_id", jobId);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          return q.order("id", { ascending: true });
        };
        const { data: interviewRows, error: interviewErr } = await fetchAllSupabasePages(
          (rangeFrom, rangeTo) => buildInterviewsQuery().range(rangeFrom, rangeTo),
        );
        if (interviewErr) {
          logger.error("Analytics recruiter_productivity interviews failed", {
            error: String(interviewErr),
          });
          return jsonError("Failed to fetch recruiter productivity", 500);
        }

        const recruiterMap = new Map<
          string,
          {
            recruiter_id: string;
            recruiter_name: string;
            jobs_owned: number;
            applications_reviewed: number;
            hires_closed: number;
            interviews_scheduled: number;
            close_rate: number | null;
          }
        >();
        for (const p of profileRows ?? []) {
          recruiterMap.set(p.id as string, {
            recruiter_id: p.id as string,
            recruiter_name: ((p.full_name as string | null) ?? "Unknown").trim() || "Unknown",
            jobs_owned: 0,
            applications_reviewed: 0,
            hires_closed: 0,
            interviews_scheduled: 0,
            close_rate: null,
          });
        }

        for (const j of jobsRows ?? []) {
          const ownerId =
            (j.assigned_recruiter_id as string | null) ?? (j.created_by as string | null);
          if (!ownerId) continue;
          if (!recruiterMap.has(ownerId)) {
            recruiterMap.set(ownerId, {
              recruiter_id: ownerId,
              recruiter_name: "Unknown",
              jobs_owned: 0,
              applications_reviewed: 0,
              hires_closed: 0,
              interviews_scheduled: 0,
              close_rate: null,
            });
          }
          recruiterMap.get(ownerId)!.jobs_owned += 1;
        }

        for (const a of appsRows ?? []) {
          const job = firstJoinedRecord(
            (a as { jobs?: Record<string, unknown> | Array<Record<string, unknown>> | null }).jobs,
          );
          const ownerId =
            (job?.assigned_recruiter_id as string | null) ?? (job?.created_by as string | null);
          if (!ownerId || !recruiterMap.has(ownerId)) continue;
          const agg = recruiterMap.get(ownerId)!;
          agg.applications_reviewed += 1;
          if ((a.status as string) === "hired") agg.hires_closed += 1;
        }

        for (const row of interviewRows ?? []) {
          if (!row.interview_scheduled_at) continue;
          const job = firstJoinedRecord(
            (row as { jobs?: Record<string, unknown> | Array<Record<string, unknown>> | null })
              .jobs,
          );
          const ownerId =
            (job?.assigned_recruiter_id as string | null) ?? (job?.created_by as string | null);
          if (!ownerId || !recruiterMap.has(ownerId)) continue;
          recruiterMap.get(ownerId)!.interviews_scheduled += 1;
        }

        const recruiters = [...recruiterMap.values()]
          .map((row) => ({
            ...row,
            close_rate:
              row.applications_reviewed > 0 ? row.hires_closed / row.applications_reviewed : null,
          }))
          .sort((a, b) => b.hires_closed - a.hires_closed)
          .slice(0, 50);

        const value = { recruiters };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "cost_per_hire": {
        if (!orgFilter.organisation_id) {
          return jsonError("Select an organisation context for this report", 400);
        }
        if (isHiringManager) {
          const value = {
            cost_per_hire: {
              total_cost_usd: null,
              invoiced_cost_usd: null,
              estimated_cost_usd: null,
              hired_count: 0,
              cost_per_hire_usd: null,
              note: "Org-level spend is not scoped to a hiring manager in this report.",
            },
          };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }

        const buildCostQuery = () => {
          let q = supabase
            .from("platform_cost_events")
            .select("amount_usd, status")
            .eq("organisation_id", orgFilter.organisation_id!);
          if (from) q = q.gte("occurred_at", from);
          if (to) q = q.lte("occurred_at", to);
          return q.order("id", { ascending: true });
        };
        const { data: costRows, error: costErr } = await fetchAllSupabasePages(
          (rangeFrom, rangeTo) => buildCostQuery().range(rangeFrom, rangeTo),
        );
        if (costErr) {
          logger.error("Analytics cost_per_hire costs failed", { error: String(costErr) });
          return jsonError("Failed to fetch cost-per-hire metrics", 500);
        }

        let hiredQuery = supabase
          .from("applications")
          .select("id, jobs!inner(id, organisation_id)", { count: "exact", head: true })
          .eq("status", "hired")
          .eq("jobs.organisation_id", orgFilter.organisation_id!);
        if (jobId) hiredQuery = hiredQuery.eq("job_id", jobId);
        if (from) hiredQuery = hiredQuery.gte("updated_at", from);
        if (to) hiredQuery = hiredQuery.lte("updated_at", to);
        const { count: hiredCount, error: hiredErr } = await hiredQuery;
        if (hiredErr) {
          logger.error("Analytics cost_per_hire hires failed", { error: String(hiredErr) });
          return jsonError("Failed to fetch cost-per-hire metrics", 500);
        }

        let total = 0;
        let invoiced = 0;
        let estimated = 0;
        for (const row of costRows ?? []) {
          const amount = Number((row.amount_usd as number) ?? 0);
          total += amount;
          if ((row.status as string) === "invoiced") invoiced += amount;
          else estimated += amount;
        }
        const safeHires = hiredCount ?? 0;
        const value = {
          cost_per_hire: {
            total_cost_usd: Number(total.toFixed(2)),
            invoiced_cost_usd: Number(invoiced.toFixed(2)),
            estimated_cost_usd: Number(estimated.toFixed(2)),
            hired_count: safeHires,
            cost_per_hire_usd: safeHires > 0 ? Number((total / safeHires).toFixed(2)) : null,
            note: null,
          },
        };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }

      case "fitscore": {
        if (!orgFilter.organisation_id) {
          return jsonError("Select an organisation context for this report", 400);
        }
        if (isHiringManager && hmJobIds.length === 0) {
          const value = {
            fitscore: {
              pair_count: 0,
              unique_candidate_count: 0,
              strong_match_count: 0,
              avg_overall: null,
              strong_match_rate: null,
              by_job: [],
              distribution: [],
            },
          };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        }
        try {
          const fitscore = await getFitScoreAnalytics(supabase, orgFilter.organisation_id, {
            jobId: jobId ?? undefined,
            jobIds: isHiringManager && !jobId ? hmJobIds : undefined,
          });
          const value = { fitscore };
          analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
          return jsonSuccess(value);
        } catch (err) {
          logger.error("Analytics fitscore failed", { error: String(err) });
          return jsonError("Failed to fetch FitScore analytics", 500);
        }
      }

      case "overview":
      default: {
        const orgEq = orgFilter.organisation_id;
        const now = new Date();
        const nowIso = now.toISOString();
        const appJobJoinSelect = isHiringManager
          ? "id, jobs!inner(organisation_id, hiring_manager_id)"
          : "id, jobs!inner(organisation_id)";

        let openJobsQuery = orgEq
          ? supabase
              .from("jobs")
              .select("id", { count: "exact", head: true })
              .eq("organisation_id", orgEq)
              .eq("status", "open")
          : supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open");
        if (isHiringManager && orgEq) {
          openJobsQuery = openJobsQuery.eq("hiring_manager_id", ctx.userId);
        }

        let totalAppsQuery = orgEq
          ? supabase.from("applications").select(appJobJoinSelect, {
              count: "exact",
              head: true,
            })
          : supabase.from("applications").select("id", { count: "exact", head: true });
        if (orgEq) {
          totalAppsQuery = totalAppsQuery.eq(
            "jobs.organisation_id",
            orgEq,
          ) as typeof totalAppsQuery;
        }
        if (isHiringManager && orgEq) {
          totalAppsQuery = totalAppsQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof totalAppsQuery;
        }

        let hiredAppsQuery = orgEq
          ? supabase
              .from("applications")
              .select(appJobJoinSelect, { count: "exact", head: true })
              .eq("jobs.organisation_id", orgEq)
              .eq("status", "hired")
          : supabase
              .from("applications")
              .select("id", { count: "exact", head: true })
              .eq("status", "hired");
        if (isHiringManager && orgEq) {
          hiredAppsQuery = hiredAppsQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof hiredAppsQuery;
        }

        let activeAppsQuery = orgEq
          ? supabase
              .from("applications")
              .select(appJobJoinSelect, { count: "exact", head: true })
              .eq("jobs.organisation_id", orgEq)
              .eq("status", "applied")
          : supabase
              .from("applications")
              .select("id", { count: "exact", head: true })
              .eq("status", "applied");
        if (isHiringManager && orgEq) {
          activeAppsQuery = activeAppsQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof activeAppsQuery;
        }

        const [jobsRes, appsRes, hiredRes, activeAppsRes] = await Promise.all([
          openJobsQuery,
          totalAppsQuery,
          hiredAppsQuery,
          activeAppsQuery,
        ]);

        const startOfMonth = new Date(now);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const clientTomorrow = parseClientTomorrowWindow(
          url.searchParams.get("tomorrowStart"),
          url.searchParams.get("tomorrowEnd"),
          now,
        );
        const tomorrowStart =
          clientTomorrow?.start ??
          (() => {
            const t = new Date(now);
            t.setUTCDate(t.getUTCDate() + 1);
            t.setUTCHours(0, 0, 0, 0);
            return t;
          })();
        const tomorrowEnd =
          clientTomorrow?.end ??
          (() => {
            const t = new Date(tomorrowStart);
            t.setUTCDate(t.getUTCDate() + 1);
            return t;
          })();

        // Filter by org for non-super_admin users - use join to ensure RLS filtering
        const pipelineJobJoin = isHiringManager
          ? "id, jobs!inner(organisation_id, hiring_manager_id)"
          : "id, jobs!inner(organisation_id)";
        const pipelinePreviewJobJoin = isHiringManager
          ? "id, interview_scheduled_at, interview_outcome, candidates(name), jobs!inner(title, organisation_id, hiring_manager_id)"
          : "id, interview_scheduled_at, interview_outcome, candidates(name), jobs!inner(title, organisation_id)";

        let appsThisMonthQuery = supabase
          .from("applications")
          .select(orgEq ? appJobJoinSelect : "id", { count: "exact", head: true })
          .gte("created_at", startOfMonth.toISOString());
        if (orgEq) {
          appsThisMonthQuery = appsThisMonthQuery.eq("jobs.organisation_id", orgEq);
        }
        if (isHiringManager && orgEq) {
          appsThisMonthQuery = appsThisMonthQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof appsThisMonthQuery;
        }

        const pipelineQueryBase = supabase.from("pipeline_candidates");
        let pipelineCountQuery = pipelineQueryBase.select(orgEq ? pipelineJobJoin : "id", {
          count: "exact",
          head: true,
        });
        if (orgEq) {
          pipelineCountQuery = pipelineCountQuery.eq("jobs.organisation_id", orgEq);
        }
        if (isHiringManager && orgEq) {
          pipelineCountQuery = pipelineCountQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof pipelineCountQuery;
        }

        let pendingFeedbackCountQuery = supabase
          .from("pipeline_candidates")
          .select(orgEq ? pipelineJobJoin : "id", { count: "exact", head: true })
          .not("interview_scheduled_at", "is", null)
          .lt("interview_scheduled_at", nowIso)
          .is("interview_outcome", null);
        if (orgEq) {
          pendingFeedbackCountQuery = pendingFeedbackCountQuery.eq("jobs.organisation_id", orgEq);
        }
        if (isHiringManager && orgEq) {
          pendingFeedbackCountQuery = pendingFeedbackCountQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof pendingFeedbackCountQuery;
        }

        let tomorrowInterviewsCountQuery = supabase
          .from("pipeline_candidates")
          .select(orgEq ? pipelineJobJoin : "id", { count: "exact", head: true })
          .gte("interview_scheduled_at", tomorrowStart.toISOString())
          .lt("interview_scheduled_at", tomorrowEnd.toISOString());
        if (orgEq) {
          tomorrowInterviewsCountQuery = tomorrowInterviewsCountQuery.eq(
            "jobs.organisation_id",
            orgEq,
          );
        }
        if (isHiringManager && orgEq) {
          tomorrowInterviewsCountQuery = tomorrowInterviewsCountQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof tomorrowInterviewsCountQuery;
        }

        let overdueFeedbackCountQuery = supabase
          .from("pipeline_candidates")
          .select(orgEq ? pipelineJobJoin : "id", { count: "exact", head: true })
          .not("interview_scheduled_at", "is", null)
          .lt("interview_scheduled_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .is("interview_outcome", null);
        if (orgEq) {
          overdueFeedbackCountQuery = overdueFeedbackCountQuery.eq("jobs.organisation_id", orgEq);
        }
        if (isHiringManager && orgEq) {
          overdueFeedbackCountQuery = overdueFeedbackCountQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof overdueFeedbackCountQuery;
        }

        let upcomingInterviewsQuery: any = supabase
          .from("pipeline_candidates")
          .select(
            orgEq
              ? pipelinePreviewJobJoin
              : "id, interview_scheduled_at, interview_outcome, candidates(name), jobs(title)",
          )
          .not("interview_scheduled_at", "is", null)
          .gte("interview_scheduled_at", nowIso)
          .order("interview_scheduled_at", { ascending: true })
          .limit(4);
        if (orgEq) {
          upcomingInterviewsQuery = upcomingInterviewsQuery.eq("jobs.organisation_id", orgEq);
        }
        if (isHiringManager && orgEq) {
          upcomingInterviewsQuery = upcomingInterviewsQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof upcomingInterviewsQuery;
        }

        let pendingFeedbackPreviewQuery: any = supabase
          .from("pipeline_candidates")
          .select(
            orgEq
              ? pipelinePreviewJobJoin
              : "id, interview_scheduled_at, interview_outcome, candidates(name), jobs(title)",
          )
          .not("interview_scheduled_at", "is", null)
          .lt("interview_scheduled_at", nowIso)
          .is("interview_outcome", null)
          .order("interview_scheduled_at", { ascending: true })
          .limit(3);
        if (orgEq) {
          pendingFeedbackPreviewQuery = pendingFeedbackPreviewQuery.eq(
            "jobs.organisation_id",
            orgEq,
          );
        }
        if (isHiringManager && orgEq) {
          pendingFeedbackPreviewQuery = pendingFeedbackPreviewQuery.eq(
            "jobs.hiring_manager_id",
            ctx.userId,
          ) as typeof pendingFeedbackPreviewQuery;
        }

        const fitStatsPromise = orgEq
          ? (async () => {
              try {
                return await getFitScoreAnalytics(supabase, orgEq, {
                  jobIds: isHiringManager ? hmJobIds : undefined,
                });
              } catch (err) {
                logger.warn("getFitScoreAnalytics failed in overview", {
                  error: String(err),
                });
                return null;
              }
            })()
          : Promise.resolve(null);

        // period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD → explicit window anchored at `to`;
        // otherwise the preset windows (30d/90d/12mo) anchored at now.
        const customPeriod =
          url.searchParams.get("period") === "custom"
            ? resolveCustomPeriod(url.searchParams.get("from"), url.searchParams.get("to"))
            : null;
        const periodDays =
          customPeriod?.periodDays ?? resolvePeriodDays(url.searchParams.get("period"));
        const periodAnchor = customPeriod?.anchor;
        const kpiScope = {
          isHiringManager,
          userId: ctx.userId,
          hmJobIds,
        };
        const trendsPromise = orgEq
          ? getAnalyticsKpiTrends(supabase, orgEq, kpiScope, periodDays, periodAnchor).catch(
              (err) => {
                logger.warn("getAnalyticsKpiTrends failed in overview", {
                  error: String(err),
                });
                return null;
              },
            )
          : Promise.resolve(null);

        const seriesPromise = orgEq
          ? getAnalyticsKpiSeries(supabase, orgEq, kpiScope, periodDays, periodAnchor).catch(
              (err) => {
                logger.warn("getAnalyticsKpiSeries failed in overview", {
                  error: String(err),
                });
                return null;
              },
            )
          : Promise.resolve(null);

        const [
          { count: appsThisMonth },
          { count: pipelineCount },
          { count: pendingFeedbackCount },
          { count: tomorrowInterviewsCount },
          { count: overdueFeedbackCount },
          upcomingInterviewsRes,
          pendingFeedbackPreviewRes,
          fitScoreDetail,
          trends,
          series,
        ] = await Promise.all([
          appsThisMonthQuery,
          pipelineCountQuery,
          pendingFeedbackCountQuery,
          tomorrowInterviewsCountQuery,
          overdueFeedbackCountQuery,
          upcomingInterviewsQuery,
          pendingFeedbackPreviewQuery,
          fitStatsPromise,
          trendsPromise,
          seriesPromise,
        ]);

        const fitScorePairCount = fitScoreDetail?.pair_count ?? 0;
        const fitScoreUniqueCandidateCount = fitScoreDetail?.unique_candidate_count ?? 0;
        const fitScoreStrongMatchCount = fitScoreDetail?.strong_match_count ?? 0;
        const fitScoreAvgOverall = fitScoreDetail?.avg_overall ?? null;

        const value = {
          overview: {
            activeJobs: jobsRes.count ?? 0,
            totalApplications: appsRes.count ?? 0,
            hiredCount: hiredRes.count ?? 0,
            /** Applications still in `applied` status for this organisation's jobs. */
            pendingApplications: activeAppsRes.count ?? 0,
            applicationsThisMonth: appsThisMonth ?? 0,
            pipelineCount: pipelineCount ?? 0,
            pendingFeedbackCount: pendingFeedbackCount ?? 0,
            tomorrowInterviewsCount: tomorrowInterviewsCount ?? 0,
            overdueFeedbackCount: overdueFeedbackCount ?? 0,
            upcomingInterviews: ((upcomingInterviewsRes.data ?? []) as PipelinePreviewRow[]).map(
              mapPipelinePreviewRow,
            ),
            pendingFeedbackPreview: (
              (pendingFeedbackPreviewRes.data ?? []) as PipelinePreviewRow[]
            ).map(mapPipelinePreviewRow),
            fitScorePairCount,
            fitScoreUniqueCandidateCount,
            fitScoreStrongMatchCount,
            fitScoreAvgOverall,
            fitScoreStrongMatchRate: fitScoreDetail?.strong_match_rate ?? null,
            tomorrowWindowStartIso: tomorrowStart.toISOString(),
            tomorrowWindowEndIso: tomorrowEnd.toISOString(),
          },
          fitScore: fitScoreDetail,
          trends,
          series,
        };
        analyticsResponseCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }
    }
  } catch (err) {
    return handleApiError(err, "Failed to fetch analytics", {
      route: "GET /api/analytics",
    });
  }
}
