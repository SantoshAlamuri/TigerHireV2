import { NextResponse } from "next/server";
import { hasRole, jsonError } from "@/lib/api-helpers";
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";
import { type ExportHandlerParams, toCsv, writeExportAudit } from "../helpers";

export async function exportCostPerHire(params: ExportHandlerParams): Promise<NextResponse> {
  const { supabase, ctx, metric, from, to, jobId, scopedOrgId } = params;
  if (!scopedOrgId) return jsonError("Select an organisation context for this report", 400);
  const buildCostQuery = () => {
    let costQuery = supabase
      .from("platform_cost_events")
      .select("amount_usd, status")
      .eq("organisation_id", scopedOrgId);
    if (from) costQuery = costQuery.gte("occurred_at", from);
    if (to) costQuery = costQuery.lte("occurred_at", to);
    return costQuery.order("id", { ascending: true });
  };
  const { data: costRows, error: costErr } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
    buildCostQuery().range(rangeFrom, rangeTo),
  );
  if (costErr) return jsonError("Failed to export analytics", 500);

  let hiredQuery = supabase
    .from("applications")
    .select("id, jobs!inner(id, organisation_id)", { count: "exact", head: true })
    .eq("status", "hired")
    .eq("jobs.organisation_id", scopedOrgId);
  if (jobId) hiredQuery = hiredQuery.eq("job_id", jobId);
  if (from) hiredQuery = hiredQuery.gte("updated_at", from);
  if (to) hiredQuery = hiredQuery.lte("updated_at", to);
  const { count: hiredCount, error: hiredErr } = await hiredQuery;
  if (hiredErr) return jsonError("Failed to export analytics", 500);

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
  const csv = toCsv([
    {
      total_cost_usd: Number(total.toFixed(2)),
      invoiced_cost_usd: Number(invoiced.toFixed(2)),
      estimated_cost_usd: Number(estimated.toFixed(2)),
      hired_count: safeHires,
      cost_per_hire_usd: safeHires > 0 ? Number((total / safeHires).toFixed(2)) : null,
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
      "Content-Disposition": `attachment; filename="analytics-cost_per_hire.csv"`,
    },
  });
}

export async function exportBoardsOrDefault(params: ExportHandlerParams): Promise<NextResponse> {
  const {
    supabase,
    ctx,
    metric,
    from,
    to,
    jobId,
    sourceTable,
    sourceSelectFields,
    orderBy,
    ascending,
  } = params;
  let rows: Record<string, unknown>[] = [];
  if (metric === "boards") {
    const buildBoardsQuery = () => {
      let boardsQuery = supabase
        .from("job_distributions")
        .select(
          "id, job_id, board, status, pushed_at, removed_at, error, jobs!inner(organisation_id, title)",
        )
        .order("id", { ascending: true });
      if (!hasRole(ctx, "super_admin")) {
        boardsQuery = boardsQuery.eq("jobs.organisation_id", ctx.organisationId!);
      } else if (ctx.organisationId) {
        boardsQuery = boardsQuery.eq("jobs.organisation_id", ctx.organisationId);
      }
      if (from) boardsQuery = boardsQuery.gte("pushed_at", from);
      if (to) boardsQuery = boardsQuery.lte("pushed_at", to);
      return boardsQuery;
    };
    const { data, error } = await fetchAllSupabasePages((rangeFrom, rangeTo) =>
      buildBoardsQuery().range(rangeFrom, rangeTo),
    );
    if (error) return jsonError("Failed to export analytics", 500);
    rows = (data ?? []).map((row) => ({
      id: row.id,
      job_id: row.job_id,
      job_title: (row.jobs as unknown as { title?: string })?.title ?? "",
      board: row.board,
      status: row.status,
      pushed_at: row.pushed_at,
      removed_at: row.removed_at,
      error: row.error,
    }));
  } else {
    let query = supabase.from(sourceTable).select(sourceSelectFields).order(orderBy, { ascending });
    if (!hasRole(ctx, "super_admin")) {
      query = query.eq("organisation_id", ctx.organisationId!);
    } else if (ctx.organisationId) {
      query = query.eq("organisation_id", ctx.organisationId);
    }
    if (metric === "activity" && from) query = query.gte("event_at", from);
    if (metric === "activity" && to) query = query.lte("event_at", to);
    const { data, error } = await query.limit(1000);
    if (error) return jsonError("Failed to export analytics", 500);
    rows = (data ?? []) as unknown as Record<string, unknown>[];
  }

  const csv = toCsv(rows);
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
      "Content-Disposition": `attachment; filename="analytics-${metric}.csv"`,
    },
  });
}
