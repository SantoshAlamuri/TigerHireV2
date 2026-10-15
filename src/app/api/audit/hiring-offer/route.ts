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

const ENTITY_TYPES = new Set(["hiring_request", "offer", "workflow_stage"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isMissingAuditTableError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("hiring_offer_audit_events") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function extractJobIdFromApplicationsRelation(relation: unknown): string | null {
  if (!relation) return null;
  if (Array.isArray(relation)) {
    const first = relation[0] as { job_id?: unknown } | undefined;
    return typeof first?.job_id === "string" ? first.job_id : null;
  }
  if (typeof relation === "object") {
    const rec = relation as { job_id?: unknown };
    return typeof rec.job_id === "string" ? rec.job_id : null;
  }
  return null;
}

/**
 * GET /api/audit/hiring-offer?entityType=hiring_request|offer|workflow_stage&entityId=<uuid>
 * Append-only audit trail for hiring / offer workflows (PRD F-04).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "leadership", "recruiter", "finance", "hiring_manager", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (!entityType || !entityId) {
      return jsonError("entityType and entityId query parameters are required", 400);
    }
    if (!ENTITY_TYPES.has(entityType)) {
      return jsonError("Invalid entityType", 400);
    }
    if (!UUID_REGEX.test(entityId)) {
      return jsonError("Invalid entityId", 400);
    }

    const supabase = await createSupabaseServerClient();
    let organisationId: string | null = null;
    let hiringManagerVisible = false;

    if (entityType === "hiring_request") {
      const { data, error } = await supabase
        .from("hiring_requests")
        .select("organisation_id, created_by")
        .eq("id", entityId)
        .maybeSingle();
      if (error) return jsonError("Failed to resolve entity", 500);
      organisationId = (data?.organisation_id as string) ?? null;
      hiringManagerVisible = (data?.created_by as string | null) === ctx.userId;
    } else if (entityType === "offer") {
      const { data, error } = await supabase
        .from("offers")
        .select("organisation_id, applications!inner(job_id)")
        .eq("id", entityId)
        .maybeSingle();
      if (error) return jsonError("Failed to resolve entity", 500);
      organisationId = (data?.organisation_id as string) ?? null;
      const jobId = extractJobIdFromApplicationsRelation(data?.applications);
      if (jobId) {
        const { data: job } = await supabase
          .from("jobs")
          .select("hiring_manager_id")
          .eq("id", jobId)
          .maybeSingle();
        hiringManagerVisible = (job?.hiring_manager_id as string | null) === ctx.userId;
      }
    } else {
      const { data, error } = await supabase
        .from("workflow_stages")
        .select("instance_id")
        .eq("id", entityId)
        .maybeSingle();
      if (error) return jsonError("Failed to resolve entity", 500);
      const instanceId = data?.instance_id as string | undefined;
      if (instanceId) {
        const { data: inst, error: instErr } = await supabase
          .from("workflow_instances")
          .select("organisation_id, subject_type, subject_id")
          .eq("id", instanceId)
          .maybeSingle();
        if (instErr) return jsonError("Failed to resolve entity", 500);
        organisationId = (inst?.organisation_id as string) ?? null;
        const subjectType = inst?.subject_type as string | null;
        const subjectId = inst?.subject_id as string | null;
        if (subjectType === "hiring_request" && subjectId) {
          const { data: req } = await supabase
            .from("hiring_requests")
            .select("created_by")
            .eq("id", subjectId)
            .maybeSingle();
          hiringManagerVisible = (req?.created_by as string | null) === ctx.userId;
        } else if (subjectType === "offer" && subjectId) {
          const { data: offer } = await supabase
            .from("offers")
            .select("applications!inner(job_id)")
            .eq("id", subjectId)
            .maybeSingle();
          const jobId = extractJobIdFromApplicationsRelation(offer?.applications);
          if (jobId) {
            const { data: job } = await supabase
              .from("jobs")
              .select("hiring_manager_id")
              .eq("id", jobId)
              .maybeSingle();
            hiringManagerVisible = (job?.hiring_manager_id as string | null) === ctx.userId;
          }
        }
      }
    }

    if (!organisationId) return jsonError("Entity not found", 404);
    if (ctx.role === "hiring_manager" && !hiringManagerVisible) {
      return jsonError("Forbidden", 403);
    }
    if (ctx.role !== "super_admin" && ctx.organisationId !== organisationId) {
      return jsonError("Forbidden", 403);
    }

    const { data: events, error: listErr } = await supabase
      .from("hiring_offer_audit_events")
      .select(
        "id, organisation_id, entity_type, entity_id, event_type, actor_profile_id, actor_role, prev_status, new_status, decision, comments, channel, metadata, created_at",
      )
      .eq("organisation_id", organisationId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (listErr && isMissingAuditTableError(listErr)) {
      return jsonSuccess({ events: [] });
    }
    if (listErr) {
      return jsonError("Failed to load audit log", 500);
    }

    return jsonSuccess({ events: events ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch hiring/offer audit", {
      route: "GET /api/audit/hiring-offer",
    });
  }
}
