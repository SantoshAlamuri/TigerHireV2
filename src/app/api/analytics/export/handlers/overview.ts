import { NextResponse } from "next/server";
import { hasRole, jsonError } from "@/lib/api-helpers";
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";
import { type ExportHandlerParams, toCsv, writeExportAudit } from "../helpers";

export async function exportOverview(params: ExportHandlerParams): Promise<NextResponse> {
  const { supabase, ctx, metric, from, to, jobId } = params;
  const orgEq = hasRole(ctx, "super_admin") ? ctx.organisationId : ctx.organisationId!;
  const [jobsRes, appsRes, hiredRes, activeAppsRes] = await Promise.all([
    orgEq
      ? supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", orgEq)
          .eq("status", "open")
      : supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
    orgEq
      ? supabase
          .from("applications")
          .select("id, jobs!inner(organisation_id)", {
            count: "exact",
            head: true,
          })
          .eq("jobs.organisation_id", orgEq)
      : supabase.from("applications").select("id", { count: "exact", head: true }),
    orgEq
      ? supabase
          .from("applications")
          .select("id, jobs!inner(organisation_id)", { count: "exact", head: true })
          .eq("jobs.organisation_id", orgEq)
          .eq("status", "hired")
      : supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "hired"),
    orgEq
      ? supabase
          .from("applications")
          .select("id, jobs!inner(organisation_id)", { count: "exact", head: true })
          .eq("jobs.organisation_id", orgEq)
          .eq("status", "applied")
      : supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "applied"),
  ]);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const appsThisMonthQuery = orgEq
    ? supabase
        .from("applications")
        .select("id, jobs!inner(organisation_id)", { count: "exact", head: true })
        .eq("jobs.organisation_id", orgEq)
        .gte("created_at", startOfMonth.toISOString())
    : supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfMonth.toISOString());
  const { count: appsThisMonth } = await appsThisMonthQuery;

  const csv = toCsv([
    {
      activeJobs: jobsRes.count ?? 0,
      totalApplications: appsRes.count ?? 0,
      hiredCount: hiredRes.count ?? 0,
      pendingApplications: activeAppsRes.count ?? 0,
      applicationsThisMonth: appsThisMonth ?? 0,
    },
  ]);
  const { error: auditError } = await writeExportAudit({
    organisationId: ctx.organisationId ?? null,
    actorUserId: ctx.userId,
    metric,
    rowCount: 1,
    from,
    to,
    jobId,
  });
  if (auditError) return jsonError("Failed to export analytics", 500);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-overview.csv"`,
    },
  });
}

export async function exportOfferOutcomes(params: ExportHandlerParams): Promise<NextResponse> {
  const { supabase, ctx, metric, from, to, jobId } = params;
  const buildOffersQuery = () => {
    let offersQuery = supabase
      .from("offers")
      .select(
        "id, status, signing_status, sent_at, first_viewed_at, signed_at, declined_at, expired_at, applications!inner(job_id, jobs!inner(organisation_id, hiring_manager_id))",
      )
      .order("id", { ascending: true });

    if (!hasRole(ctx, "super_admin")) {
      offersQuery = offersQuery.eq("applications.jobs.organisation_id", ctx.organisationId!);
    } else if (ctx.organisationId) {
      offersQuery = offersQuery.eq("applications.jobs.organisation_id", ctx.organisationId);
    }
    if (jobId) offersQuery = offersQuery.eq("applications.job_id", jobId);
    if (from) offersQuery = offersQuery.gte("sent_at", from);
    if (to) offersQuery = offersQuery.lte("sent_at", to);
    return offersQuery;
  };

  const { data, error } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
    buildOffersQuery().range(rangeFrom, rangeTo),
  );
  if (error) return jsonError("Failed to export analytics", 500);

  const rowsRaw =
    (data as Array<{
      status?: string | null;
      signing_status?: string | null;
      sent_at?: string | null;
      first_viewed_at?: string | null;
      signed_at?: string | null;
      declined_at?: string | null;
      expired_at?: string | null;
    }>) ?? [];
  const sent = rowsRaw.filter((row) => Boolean(row.sent_at)).length;
  const viewed = rowsRaw.filter((row) => Boolean(row.first_viewed_at)).length;
  const accepted = rowsRaw.filter(
    (row) => Boolean(row.signed_at) || row.status === "accepted" || row.signing_status === "signed",
  ).length;
  const declined = rowsRaw.filter(
    (row) =>
      Boolean(row.declined_at) || row.status === "declined" || row.signing_status === "declined",
  ).length;
  const expired = rowsRaw.filter(
    (row) =>
      Boolean(row.expired_at) || row.status === "expired" || row.signing_status === "expired",
  ).length;
  const awaitingResponse = Math.max(sent - accepted - declined - expired, 0);

  const csv = toCsv([
    {
      total_offers: rowsRaw.length,
      sent_count: sent,
      viewed_count: viewed,
      accepted_count: accepted,
      declined_count: declined,
      expired_count: expired,
      awaiting_response_count: awaitingResponse,
      acceptance_rate_pct: sent > 0 ? Number(((accepted / sent) * 100).toFixed(2)) : null,
      drop_off_rate_pct: sent > 0 ? Number((((declined + expired) / sent) * 100).toFixed(2)) : null,
      response_rate_pct:
        sent > 0 ? Number((((accepted + declined) / sent) * 100).toFixed(2)) : null,
    },
  ]);
  const { error: auditError } = await writeExportAudit({
    organisationId: ctx.organisationId ?? null,
    actorUserId: ctx.userId,
    metric,
    rowCount: 1,
    from,
    to,
    jobId,
  });
  if (auditError) return jsonError("Failed to export analytics", 500);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-offer_outcomes.csv"`,
    },
  });
}
