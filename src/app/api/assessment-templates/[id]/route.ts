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
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import type { UserRole } from "@/types/database";
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

const updateTemplateSchema = z
  .object({
    type: z.enum(["written", "take_home"]).optional(),
    scope: z.enum(["screening", "shortlist", "final"]).optional(),
    name: z.string().min(2).max(120).optional(),
    content: z.string().min(10).max(250000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

async function canManageTemplates(userId: string, role: string, organisationId: string) {
  const supabase = await createSupabaseServerClient();
  const inWorkflowRoles = await hasAnyEnterpriseRole(
    userId,
    ["leadership", "recruiter", "hiring_manager", "interviewer", "super_admin"],
    supabase,
  );
  if (!inWorkflowRoles) return { allowed: false as const, supabase };

  const permissions = await getOrgSettingsPermissions(supabase, organisationId);
  const allowed =
    role === "leadership" ||
    role === "super_admin" ||
    hasSettingsCapability(role as UserRole, "manage_assessment_templates", permissions);
  return { allowed, supabase };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const permission = await canManageTemplates(ctx.userId, ctx.role, ctx.organisationId);
    if (!permission.allowed) {
      return jsonError(
        "Template management is disabled for your role by company admin settings",
        403,
      );
    }

    const parsedBody = await parseJsonBody(request, "PATCH /api/assessment-templates/[id]");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return jsonError("No template fields provided", 400);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.type) updatePayload.type = parsed.data.type;
    if (parsed.data.scope) updatePayload.scope = parsed.data.scope;
    if (parsed.data.name) updatePayload.name = parsed.data.name;
    if (parsed.data.content) updatePayload.content = parsed.data.content;
    if (typeof parsed.data.isActive === "boolean") updatePayload.is_active = parsed.data.isActive;

    const { data, error } = await permission.supabase
      .from("assessment_templates")
      .update(updatePayload)
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .select("id, type, scope, name, content, is_active, created_at, updated_at")
      .single();
    if (isMissingAssessmentTemplatesSchema(error)) {
      return jsonError(
        "Assessment templates schema is not available yet. Please run latest database migrations.",
        500,
      );
    }
    if (error || !data) return jsonError("Template not found", 404);

    return jsonSuccess({ template: data });
  } catch (err) {
    return handleApiError(err, "Failed to update assessment template", {
      route: "PATCH /api/assessment-templates/[id]",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const permission = await canManageTemplates(ctx.userId, ctx.role, ctx.organisationId);
    if (!permission.allowed) {
      return jsonError(
        "Template management is disabled for your role by company admin settings",
        403,
      );
    }

    // Soft-delete to preserve history.
    const { data, error } = await permission.supabase
      .from("assessment_templates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .eq("is_active", true)
      .select("id")
      .single();
    if (isMissingAssessmentTemplatesSchema(error)) {
      return jsonError(
        "Assessment templates schema is not available yet. Please run latest database migrations.",
        500,
      );
    }
    if (error || !data) return jsonError("Template not found", 404);

    return jsonSuccess({ ok: true, archivedTemplateId: id });
  } catch (err) {
    return handleApiError(err, "Failed to archive assessment template", {
      route: "DELETE /api/assessment-templates/[id]",
    });
  }
}
