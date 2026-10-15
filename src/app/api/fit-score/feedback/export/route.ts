import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";
import { FEEDBACK_SIGNAL_THRESHOLD } from "@/lib/fitscore/constants";

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "hiring_manager",
  "agency",
] as const;

type ExportFormat = "json" | "jsonl" | "csv";

function parseDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

    const format = (request.nextUrl.searchParams.get("format") ?? "json") as ExportFormat;
    if (!["json", "jsonl", "csv"].includes(format)) {
      return jsonError("Unsupported format. Use json, jsonl, or csv.", 400);
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    const includeLowSignal = request.nextUrl.searchParams.get("include_low_signal") === "true";
    const from = parseDate(request.nextUrl.searchParams.get("from"));
    const to = parseDate(request.nextUrl.searchParams.get("to"));
    if (
      (request.nextUrl.searchParams.get("from") && !from) ||
      (request.nextUrl.searchParams.get("to") && !to)
    ) {
      return jsonError("Invalid from/to datetime format", 400);
    }

    const supabase = await createSupabaseServerClient();
    if (jobId) {
      const { job } = await assertJobAccess(supabase, ctx, jobId);
      if (!job) return jsonError("Job not found", 404);
    }

    let outcomesQ = supabase
      .from("hiring_outcomes")
      .select(
        "organisation_id, job_id, candidate_id, fit_score_id, fit_score_value, scoring_version, accuracy_signal, feedback_reason, note, outcome, source, source_event_id, submitted_by, recorded_by, created_at, recorded_at, jobs!inner(role_function)",
      );
    let actionsQ = supabase
      .from("pipeline_action_signals")
      .select(
        "organisation_id, job_id, candidate_id, pipeline_candidate_id, fit_score_id, fit_score_value, scoring_version, action, stage_id, stage_name, metadata, submitted_by, created_at, jobs!inner(role_function)",
      );

    if (!hasRole(ctx, "super_admin")) {
      outcomesQ = outcomesQ.eq("organisation_id", ctx.organisationId!);
      actionsQ = actionsQ.eq("organisation_id", ctx.organisationId!);
    } else if (ctx.organisationId) {
      outcomesQ = outcomesQ.eq("organisation_id", ctx.organisationId);
      actionsQ = actionsQ.eq("organisation_id", ctx.organisationId);
    }
    if (jobId) {
      outcomesQ = outcomesQ.eq("job_id", jobId);
      actionsQ = actionsQ.eq("job_id", jobId);
    } else if (ctx.role === "hiring_manager") {
      // Without an explicit jobId, a hiring manager must be narrowed to their own
      // jobs rather than seeing the whole org's feedback (sibling analytics routes
      // apply the same narrowing). An empty list yields an empty export.
      const hmJobIds = await listHiringManagerJobIds(supabase, ctx.organisationId!, ctx.userId);
      outcomesQ = outcomesQ.in("job_id", hmJobIds);
      actionsQ = actionsQ.in("job_id", hmJobIds);
    }
    if (from) {
      outcomesQ = outcomesQ.gte("created_at", from);
      actionsQ = actionsQ.gte("created_at", from);
    }
    if (to) {
      outcomesQ = outcomesQ.lte("created_at", to);
      actionsQ = actionsQ.lte("created_at", to);
    }

    const [{ data: outcomes }, { data: actions }] = await Promise.all([outcomesQ, actionsQ]);

    const feedbackCountByFamily = new Map<string, number>();
    for (const row of outcomes ?? []) {
      const roleFamily =
        ((row.jobs as { role_function?: string } | null)?.role_function ?? "unknown").trim() ||
        "unknown";
      const accuracy = String(row.accuracy_signal ?? "");
      if (accuracy === "accurate" || accuracy === "too_low" || accuracy === "too_high") {
        feedbackCountByFamily.set(roleFamily, (feedbackCountByFamily.get(roleFamily) ?? 0) + 1);
      }
    }

    const baseRows = [
      ...(outcomes ?? []).map((row) => ({
        event_type: "terminal_outcome",
        event_at: row.recorded_at ?? row.created_at ?? null,
        organisation_id: row.organisation_id ?? null,
        job_id: row.job_id ?? null,
        candidate_id: row.candidate_id ?? null,
        pipeline_candidate_id: null,
        fit_score_id: row.fit_score_id ?? null,
        fit_score_value: row.fit_score_value ?? null,
        scoring_version: row.scoring_version ?? null,
        action: null,
        stage_id: null,
        stage_name: null,
        outcome: row.outcome ?? null,
        accuracy_signal: row.accuracy_signal ?? null,
        feedback_reason: row.feedback_reason ?? null,
        note: row.note ?? null,
        source: row.source ?? null,
        source_event_id: row.source_event_id ?? null,
        submitted_by: row.submitted_by ?? null,
        recorded_by: row.recorded_by ?? null,
        role_family:
          ((row.jobs as { role_function?: string } | null)?.role_function ?? "unknown").trim() ||
          "unknown",
        low_signal_warning: false,
        metadata: null,
      })),
      ...(actions ?? []).map((row) => ({
        event_type: "pipeline_action",
        event_at: row.created_at ?? null,
        organisation_id: row.organisation_id ?? null,
        job_id: row.job_id ?? null,
        candidate_id: row.candidate_id ?? null,
        pipeline_candidate_id: row.pipeline_candidate_id ?? null,
        fit_score_id: row.fit_score_id ?? null,
        fit_score_value: row.fit_score_value ?? null,
        scoring_version: row.scoring_version ?? null,
        action: row.action ?? null,
        stage_id: row.stage_id ?? null,
        stage_name: row.stage_name ?? null,
        outcome: null,
        accuracy_signal: null,
        feedback_reason: null,
        note: null,
        source: "manual",
        source_event_id: null,
        submitted_by: row.submitted_by ?? null,
        recorded_by: null,
        role_family:
          ((row.jobs as { role_function?: string } | null)?.role_function ?? "unknown").trim() ||
          "unknown",
        low_signal_warning: false,
        metadata: row.metadata ?? null,
      })),
    ];

    const rows = baseRows
      .filter((row) => {
        const count = feedbackCountByFamily.get(String(row.role_family)) ?? 0;
        return includeLowSignal || count >= FEEDBACK_SIGNAL_THRESHOLD;
      })
      .map((row) => {
        const count = feedbackCountByFamily.get(String(row.role_family)) ?? 0;
        return { ...row, low_signal_warning: count < FEEDBACK_SIGNAL_THRESHOLD };
      })
      .toSorted((a, b) => {
        const at = a.event_at ? new Date(a.event_at).getTime() : 0;
        const bt = b.event_at ? new Date(b.event_at).getTime() : 0;
        return bt - at;
      });

    const auditAdmin = createSupabaseAdmin();
    const { error: auditError } = await auditAdmin.from("audit_log").insert({
      organisation_id: ctx.organisationId ?? null,
      actor_user_id: ctx.userId,
      actor_email: null,
      event_type: "export.fit_score.feedback",
      resource_type: "hiring_outcomes",
      resource_id: jobId ?? null,
      metadata: {
        route: "GET /api/fit-score/feedback/export",
        format,
        include_low_signal: includeLowSignal,
        from,
        to,
        row_count: rows.length,
      },
    });
    if (auditError) {
      return jsonError("Failed to export hiring outcomes feedback dataset", 500);
    }

    if (format === "json") {
      return NextResponse.json({
        threshold: FEEDBACK_SIGNAL_THRESHOLD,
        include_low_signal: includeLowSignal,
        rows,
        count: rows.length,
      });
    }

    if (format === "jsonl") {
      const body = rows.map((r) => JSON.stringify(r)).join("\n");
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Content-Disposition": 'attachment; filename="hiring-outcomes-export.jsonl"',
        },
      });
    }

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hiring-outcomes-export.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to export hiring outcomes feedback dataset", {
      route: "GET /api/fit-score/feedback/export",
    });
  }
}
