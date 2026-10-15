import { z } from "zod";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getOrgSettingsPermissions,
  isRequisitionAdvancedModeEnabled,
} from "@/lib/settings/permissions";

const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    roleLevel: z.string().trim().max(100).optional().nullable(),
    department: z.string().trim().max(120).optional().nullable(),
    summary: z.string().trim().max(500).optional().nullable(),
    keywords: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
    templateText: z.string().max(12000).optional().nullable(),
    jdSections: z.array(z.record(z.string(), z.unknown())).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const REQUISITION_TEMPLATE_SELECT_COLUMNS =
  "id, organisation_id, name, role_level, department, summary, keywords, template_text, jd_sections, version, is_active, created_by, updated_by, created_at, updated_at";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("requisition_jd_templates")
      .select(REQUISITION_TEMPLATE_SELECT_COLUMNS)
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Template not found", 404);
    return jsonSuccess({ template: data });
  } catch (err) {
    return handleApiError(err, "Failed to fetch requisition template", {
      route: "GET /api/requisition-templates/[id]",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "recruiter", "leadership", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const parsedBody = await parseJsonBody(request, "PATCH /api/requisition-templates/[id]");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const payload = parsed.data;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    };
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.roleLevel !== undefined) updates.role_level = payload.roleLevel;
    if (payload.department !== undefined) updates.department = payload.department;
    if (payload.summary !== undefined) updates.summary = payload.summary;
    if (payload.keywords !== undefined) updates.keywords = payload.keywords;
    if (payload.templateText !== undefined) updates.template_text = payload.templateText;
    if (payload.jdSections !== undefined) updates.jd_sections = payload.jdSections;
    if (payload.isActive !== undefined) updates.is_active = payload.isActive;
    updates.version = `version + 1`;

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    if (!isRequisitionAdvancedModeEnabled(permissions)) {
      return jsonError(
        "Requisition advanced mode is disabled. Enable it in Settings > Permissions first.",
        409,
      );
    }
    const { data: current, error: currentErr } = await supabase
      .from("requisition_jd_templates")
      .select("version")
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    if (currentErr) throw currentErr;
    if (!current) return jsonError("Template not found", 404);
    updates.version = Number(current.version ?? 1) + 1;

    const { data, error } = await supabase
      .from("requisition_jd_templates")
      .update(updates)
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .select(REQUISITION_TEMPLATE_SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Template not found", 404);

    return jsonSuccess({ template: data });
  } catch (err) {
    return handleApiError(err, "Failed to update requisition template", {
      route: "PATCH /api/requisition-templates/[id]",
    });
  }
}
