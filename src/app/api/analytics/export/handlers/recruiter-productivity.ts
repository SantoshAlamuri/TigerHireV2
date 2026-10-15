import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-helpers";
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";
import { type ExportHandlerParams, toCsv, writeExportAudit } from "../helpers";

export async function exportRecruiterProductivity(
  params: ExportHandlerParams,
): Promise<NextResponse> {
  const { supabase, ctx, metric, from, to, jobId, scopedOrgId } = params;
  if (!scopedOrgId) return jsonError("Select an organisation context for this report", 400);
  const buildJobsQuery = () => {
    let jobsQuery = supabase
      .from("jobs")
      .select("id, assigned_recruiter_id, created_by, organisation_id, created_at")
      .eq("organisation_id", scopedOrgId);
    if (jobId) jobsQuery = jobsQuery.eq("id", jobId);
    if (from) jobsQuery = jobsQuery.gte("created_at", from);
    if (to) jobsQuery = jobsQuery.lte("created_at", to);
    return jobsQuery.order("id", { ascending: true });
  };
  const { data: jobsRows, error: jobsErr } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
    buildJobsQuery().range(rangeFrom, rangeTo),
  );
  if (jobsErr) return jsonError("Failed to export analytics", 500);

  const ownerByJobId = new Map<string, string>();
  const recruiterIds = new Set<string>();
  for (const row of jobsRows ?? []) {
    const ownerId =
      (row.assigned_recruiter_id as string | null) ?? (row.created_by as string | null);
    if (!ownerId) continue;
    ownerByJobId.set(row.id as string, ownerId);
    recruiterIds.add(ownerId);
  }

  if (recruiterIds.size === 0) {
    const { error: auditError } = await writeExportAudit({
      organisationId: ctx.organisationId ?? null,
      actorUserId: ctx.userId,
      metric,
      rowCount: 0,
      from,
      to,
      jobId,
    });
    if (auditError) return jsonError("Failed to export analytics", 500);
    return new NextResponse("", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="analytics-recruiter_productivity.csv"`,
      },
    });
  }

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...recruiterIds]);

  const jobIds = [...ownerByJobId.keys()];
  const buildAppsQuery = () => {
    let appsQuery = supabase
      .from("applications")
      .select("id, status, created_at, job_id")
      .in("job_id", jobIds)
      .order("id", { ascending: true });
    if (from) appsQuery = appsQuery.gte("created_at", from);
    if (to) appsQuery = appsQuery.lte("created_at", to);
    return appsQuery;
  };
  const { data: appRows } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
    buildAppsQuery().range(rangeFrom, rangeTo),
  );

  const buildInterviewsQuery = () => {
    let interviewsQuery = supabase
      .from("pipeline_candidates")
      .select("id, interview_scheduled_at, created_at, job_id")
      .in("job_id", jobIds)
      .order("id", { ascending: true });
    if (from) interviewsQuery = interviewsQuery.gte("created_at", from);
    if (to) interviewsQuery = interviewsQuery.lte("created_at", to);
    return interviewsQuery;
  };
  const { data: interviewRows } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
    buildInterviewsQuery().range(rangeFrom, rangeTo),
  );

  const agg = new Map<
    string,
    {
      recruiter_id: string;
      recruiter_name: string;
      jobs_owned: number;
      applications_reviewed: number;
      hires_closed: number;
      interviews_scheduled: number;
      close_rate_pct: number | null;
    }
  >();
  for (const profile of profileRows ?? []) {
    agg.set(profile.id as string, {
      recruiter_id: profile.id as string,
      recruiter_name: ((profile.full_name as string | null) ?? "Unknown").trim() || "Unknown",
      jobs_owned: 0,
      applications_reviewed: 0,
      hires_closed: 0,
      interviews_scheduled: 0,
      close_rate_pct: null,
    });
  }
  for (const row of jobsRows ?? []) {
    const ownerId =
      (row.assigned_recruiter_id as string | null) ?? (row.created_by as string | null);
    if (!ownerId) continue;
    if (!agg.has(ownerId)) {
      agg.set(ownerId, {
        recruiter_id: ownerId,
        recruiter_name: "Unknown",
        jobs_owned: 0,
        applications_reviewed: 0,
        hires_closed: 0,
        interviews_scheduled: 0,
        close_rate_pct: null,
      });
    }
    agg.get(ownerId)!.jobs_owned += 1;
  }
  for (const row of appRows ?? []) {
    const ownerId = ownerByJobId.get(row.job_id as string);
    if (!ownerId || !agg.has(ownerId)) continue;
    agg.get(ownerId)!.applications_reviewed += 1;
    if ((row.status as string) === "hired") agg.get(ownerId)!.hires_closed += 1;
  }
  for (const row of interviewRows ?? []) {
    if (!row.interview_scheduled_at) continue;
    const ownerId = ownerByJobId.get(row.job_id as string);
    if (!ownerId || !agg.has(ownerId)) continue;
    agg.get(ownerId)!.interviews_scheduled += 1;
  }

  const rows = [...agg.values()]
    .map((row) => ({
      ...row,
      close_rate_pct:
        row.applications_reviewed > 0
          ? Number(((row.hires_closed / row.applications_reviewed) * 100).toFixed(2))
          : null,
    }))
    .sort((a, b) => b.hires_closed - a.hires_closed);

  const csv = toCsv(rows as unknown as Record<string, unknown>[]);
  const { error: auditError } = await writeExportAudit({
    organisationId: ctx.organisationId ?? null,
    actorUserId: ctx.userId,
    metric,
    rowCount: rows.length,
    from,
    to,
    jobId,
  });
  if (auditError) return jsonError("Failed to export analytics", 500);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-recruiter_productivity.csv"`,
    },
  });
}
