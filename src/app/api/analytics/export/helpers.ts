import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/api-helpers";

export type ExportSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface ExportHandlerParams {
  supabase: ExportSupabaseClient;
  ctx: AuthContext;
  metric: string;
  from: string | null;
  to: string | null;
  jobId: string | null;
  scopedOrgId: string | null;
  sourceTable: string;
  sourceSelectFields: string;
  orderBy: string;
  ascending: boolean;
}

export const ALLOWED_METRICS = new Set([
  "pipeline",
  "sources",
  "time_to_hire",
  "activity",
  "boards",
  "offer_outcomes",
  "recruiter_productivity",
  "cost_per_hire",
  "overview",
]);
export const EXPORT_TIME_TO_HIRE_SELECT_FIELDS =
  "organisation_id, job_id, job_title, avg_days_to_hire, min_days, max_days, hired_count";
export const EXPORT_PIPELINE_CONVERSION_SELECT_FIELDS =
  "organisation_id, job_id, job_title, total_applications, viewed, shortlisted, hired, rejected, withdrawn, hire_rate_pct";
export const EXPORT_CANDIDATE_SOURCES_SELECT_FIELDS = "organisation_id, source, candidate_count";
export const EXPORT_RECENT_ACTIVITY_SELECT_FIELDS =
  "organisation_id, event_id, job_id, event_type, event_detail, job_title, event_at";

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escaped = (value: unknown) => {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escaped(row[header])).join(",")),
  ];
  return lines.join("\n");
}

export async function writeExportAudit(params: {
  organisationId: string | null;
  actorUserId: string;
  metric: string;
  rowCount: number;
  from: string | null;
  to: string | null;
  jobId: string | null;
}) {
  const admin = createSupabaseAdmin();
  return admin.from("audit_log").insert({
    organisation_id: params.organisationId,
    actor_user_id: params.actorUserId,
    actor_email: null,
    event_type: "export.analytics.csv",
    resource_type: "analytics",
    resource_id: params.jobId,
    metadata: {
      route: "GET /api/analytics/export",
      metric: params.metric,
      from: params.from,
      to: params.to,
      row_count: params.rowCount,
    },
  });
}
