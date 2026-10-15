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

const createTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    roleLevel: z.string().trim().max(100).optional().nullable(),
    department: z.string().trim().max(120).optional().nullable(),
    summary: z.string().trim().max(500).optional().nullable(),
    keywords: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
    templateText: z.string().max(12000).optional().nullable(),
    jdSections: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict();

const REQUISITION_TEMPLATE_SELECT_COLUMNS =
  "id, organisation_id, name, role_level, department, summary, keywords, template_text, jd_sections, version, is_active, created_by, updated_by, created_at, updated_at";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("requisition_jd_templates")
      .select(REQUISITION_TEMPLATE_SELECT_COLUMNS)
      .eq("organisation_id", ctx.organisationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return jsonSuccess({ templates: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to load requisition templates", {
      route: "GET /api/requisition-templates",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "recruiter", "leadership", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/requisition-templates");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    if (!isRequisitionAdvancedModeEnabled(permissions)) {
      return jsonError(
        "Requisition advanced mode is disabled. Enable it in Settings > Permissions first.",
        409,
      );
    }
    const nowIso = new Date().toISOString();
    const payload = parsed.data;
    const { data, error } = await supabase
      .from("requisition_jd_templates")
      .insert({
        organisation_id: ctx.organisationId,
        name: payload.name,
        role_level: payload.roleLevel ?? null,
        department: payload.department ?? null,
        summary: payload.summary ?? null,
        keywords: payload.keywords ?? [],
        template_text: payload.templateText ?? null,
        jd_sections: payload.jdSections ?? [],
        created_by: ctx.userId,
        updated_by: ctx.userId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select(REQUISITION_TEMPLATE_SELECT_COLUMNS)
      .single();
    if (error) throw error;

    return jsonSuccess({ template: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create requisition template", {
      route: "POST /api/requisition-templates",
    });
  }
}
