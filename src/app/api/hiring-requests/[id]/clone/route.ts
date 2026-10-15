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
import { validateOrigin } from "@/lib/security/csrf";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { z } from "zod";

const cloneHiringRequestBodySchema = z.object({}).strict();

const HIRING_REQUEST_ALL_COLUMNS =
  "id, organisation_id, created_by, title, department, headcount, urgency, description, must_haves, nice_to_haves, ideal_experience, ideal_summary, notes, status, assigned_job_id, reviewed_by, created_at, updated_at, req_code, role_level, cost_center, employment_type, location_type, location_city, headcount_type, business_justification, target_joining_date, budget_ctc_min, budget_ctc_max, submitted_at, on_hold_reason, on_hold_resume_at, template_id, headcount_plan_line_id";

function isSchemaDriftError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("Could not find the")
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin")) {
      return jsonError("Forbidden", 403);
    }
    const body = await request.json().catch(() => ({}));
    const bodyParsed = cloneHiringRequestBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: source, error: srcErr } = await supabase
      .from("hiring_requests")
      .select(HIRING_REQUEST_ALL_COLUMNS)
      .eq("id", id)
      .single();
    if (srcErr || !source) return jsonError("Hiring request not found", 404);
    if (ctx.role !== "super_admin" && source.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }

    // The clone is a NEW draft owned by whoever clicked Clone. Copying the
    // source author here made RLS reject the insert (its WITH CHECK requires
    // created_by = auth.uid()), so cloning anyone else's requisition 500'd for
    // every seat except hiring managers. The audit event below still records
    // the actor, and the source requisition keeps its own author.
    const createdBy = ctx.userId;
    const nowIso = new Date().toISOString();
    const baseInsert = {
      organisation_id: source.organisation_id,
      created_by: createdBy,
      title: source.title,
      department: source.department,
      headcount: source.headcount,
      urgency: source.urgency,
      description: source.description,
      notes: source.notes,
      // The ideal-candidate section seeds the JD and the scoring profile when
      // the request becomes a job; dropping it made a clone silently worse
      // than the original.
      must_haves: source.must_haves ?? null,
      nice_to_haves: source.nice_to_haves ?? null,
      ideal_experience: source.ideal_experience ?? null,
      ideal_summary: source.ideal_summary ?? null,
      status: "draft",
      req_code: null,
      submitted_at: null,
      reviewed_by: null,
      assigned_job_id: null,
      updated_at: nowIso,
    };
    const extendedInsert = {
      ...baseInsert,
      role_level: source.role_level,
      cost_center: source.cost_center,
      employment_type: source.employment_type,
      location_type: source.location_type,
      location_city: source.location_city,
      headcount_type: source.headcount_type,
      business_justification: source.business_justification,
      target_joining_date: source.target_joining_date,
      budget_ctc_min: source.budget_ctc_min,
      budget_ctc_max: source.budget_ctc_max,
      on_hold_reason: null,
      on_hold_resume_at: null,
      template_id: source.template_id ?? null,
      headcount_plan_line_id: source.headcount_plan_line_id ?? null,
    };

    let { data: cloned, error: cloneErr } = await supabase
      .from("hiring_requests")
      .insert(extendedInsert)
      .select(HIRING_REQUEST_ALL_COLUMNS)
      .single();
    if (cloneErr && isSchemaDriftError(cloneErr)) {
      const retry = await supabase
        .from("hiring_requests")
        .insert(baseInsert)
        .select(HIRING_REQUEST_ALL_COLUMNS)
        .single();
      cloned = retry.data;
      cloneErr = retry.error;
    }
    if (cloneErr || !cloned) return jsonError("Failed to clone hiring request", 500);

    await recordHiringOfferAuditEvent({
      organisationId: source.organisation_id as string,
      entityType: "hiring_request",
      entityId: cloned.id as string,
      eventType: "HIRING_REQUEST_CLONED",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: null,
      newStatus: "draft",
      ipAddress: getRequestClientIp(request),
      metadata: { source_hiring_request_id: id },
    });

    return jsonSuccess({ request: cloned }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to clone hiring request", {
      route: "POST /api/hiring-requests/[id]/clone",
    });
  }
}
