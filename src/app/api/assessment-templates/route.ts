import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import {
  DEFAULT_SETTINGS_PERMISSIONS,
  getOrgSettingsPermissions,
  hasSettingsCapability,
} from "@/lib/settings/permissions";
import { validateOrigin } from "@/lib/security/csrf";

function isMissingAssessmentTemplatesSchema(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes('relation "assessment_templates" does not exist') ||
    message.includes("column assessment_templates.")
  );
}

const createTemplateSchema = z
  .object({
    type: z.enum(["written", "take_home"]),
    scope: z.enum(["screening", "shortlist", "final"]),
    name: z.string().min(2).max(120),
    content: z.string().min(10).max(250000),
  })
  .strict();

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const inWorkflowRoles = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "interviewer", "super_admin"],
      supabase,
    );
    if (!inWorkflowRoles) return jsonError("Forbidden", 403);

    let permissions;
    try {
      permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    } catch {
      permissions = null;
    }
    const canManageTemplates =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(
        ctx.role,
        "manage_assessment_templates",
        permissions ?? DEFAULT_SETTINGS_PERMISSIONS,
      );

    const { data, error } = await supabase
      .from("assessment_templates")
      .select("id, type, scope, name, content, is_active, created_at, updated_at")
      .eq("organisation_id", ctx.organisationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingAssessmentTemplatesSchema(error)) {
        return jsonSuccess({
          templates: [],
          canManageTemplates,
          warning: "Assessment templates schema not available yet. Run the latest DB migrations.",
        });
      }
      return jsonSuccess({
        templates: [],
        canManageTemplates,
        warning: "Templates could not be loaded from DB; showing safe fallback.",
      });
    }

    return jsonSuccess({ templates: data ?? [], canManageTemplates });
  } catch (err) {
    return jsonSuccess({
      templates: [],
      canManageTemplates: false,
      warning:
        "Templates endpoint recovered from an internal error. Check server logs for details.",
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

    const supabase = await createSupabaseServerClient();
    const inWorkflowRoles = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "interviewer", "super_admin"],
      supabase,
    );
    if (!inWorkflowRoles) return jsonError("Forbidden", 403);

    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const canManageTemplates =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(ctx.role, "manage_assessment_templates", permissions);
    if (!canManageTemplates) {
      return jsonError(
        "Template management is disabled for your role by company admin settings",
        403,
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/assessment-templates");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { data, error } = await supabase
      .from("assessment_templates")
      .insert({
        organisation_id: ctx.organisationId,
        created_by: ctx.userId,
        type: parsed.data.type,
        scope: parsed.data.scope,
        name: parsed.data.name,
        content: parsed.data.content,
        is_active: true,
      })
      .select("id, type, scope, name, content, is_active, created_at, updated_at")
      .single();

    if (error || !data) {
      if (isMissingAssessmentTemplatesSchema(error)) {
        return jsonError(
          "Assessment templates schema is not available yet. Please run latest database migrations.",
          500,
        );
      }
      return jsonError("Failed to create template", 500);
    }
    return jsonSuccess({ template: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create assessment template", {
      route: "POST /api/assessment-templates",
    });
  }
}
