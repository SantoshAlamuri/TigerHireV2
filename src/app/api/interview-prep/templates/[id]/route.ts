import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import type { PrepPackTemplate } from "@/lib/interview-prep/types";
import { updateInterviewPrepTemplateSchema } from "@/lib/validations/interview-prep";
import { validateOrigin } from "@/lib/security/csrf";

type PrepTemplateRow = {
  id: string;
  role_function: string | null;
  stage_name: string | null;
  title: string;
  when_to_use: string;
  objective: string;
  question_tracks: string[] | null;
  rubric: string[] | null;
};

function isMissingInterviewPrepTemplatesSchema(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes('relation "interview_prep_templates" does not exist') ||
    message.includes("column interview_prep_templates.")
  );
}

function toTemplate(row: PrepTemplateRow): PrepPackTemplate {
  return {
    id: row.id,
    key: row.id,
    title: row.title,
    whenToUse: row.when_to_use,
    objective: row.objective,
    questionTracks: row.question_tracks ?? [],
    rubric: row.rubric ?? [],
    roleFunction: row.role_function,
    stageName: row.stage_name,
    source: "saved",
  };
}

async function resolveManagePermission() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return { ctx, canManageTemplates: false as const, supabase: null };
  if (!ctx.organisationId) return { ctx, canManageTemplates: false as const, supabase: null };

  const supabase = await createSupabaseServerClient();
  const allowedToRead = await hasAnyEnterpriseRole(
    ctx.userId,
    ["leadership", "recruiter", "hiring_manager", "super_admin"],
    supabase,
  );
  if (!allowedToRead) return { ctx, canManageTemplates: false as const, supabase };

  const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
  const canManageTemplates =
    ctx.role === "leadership" ||
    ctx.role === "super_admin" ||
    hasSettingsCapability(ctx.role, "manage_assessment_templates", permissions);

  return { ctx, canManageTemplates, supabase };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const permission = await resolveManagePermission();
    if (!requireAuth(permission.ctx)) return jsonError("Unauthorized", 401);
    if (!permission.ctx.organisationId) return jsonError("No organisation context", 400);
    if (!permission.supabase || !permission.canManageTemplates) {
      return jsonError(
        "Prep template management is disabled for your role by company admin settings",
        403,
      );
    }

    const parsedBody = await parseJsonBody(request, "PATCH /api/interview-prep/templates/[id]");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateInterviewPrepTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    if (Object.keys(parsed.data).length === 0)
      return jsonError("No prep template fields provided", 400);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.title) updatePayload.title = parsed.data.title.trim();
    if (parsed.data.whenToUse) updatePayload.when_to_use = parsed.data.whenToUse.trim();
    if (parsed.data.objective) updatePayload.objective = parsed.data.objective.trim();
    if (parsed.data.roleFunction !== undefined)
      updatePayload.role_function = parsed.data.roleFunction?.trim() || null;
    if (parsed.data.stageName !== undefined)
      updatePayload.stage_name = parsed.data.stageName?.trim() || null;
    if (parsed.data.questionTracks) updatePayload.question_tracks = parsed.data.questionTracks;
    if (parsed.data.rubric) updatePayload.rubric = parsed.data.rubric;

    const { data, error } = await permission.supabase
      .from("interview_prep_templates")
      .update(updatePayload)
      .eq("id", id)
      .eq("organisation_id", permission.ctx.organisationId)
      .eq("is_active", true)
      .select(
        "id, role_function, stage_name, title, when_to_use, objective, question_tracks, rubric",
      )
      .single();

    if (isMissingInterviewPrepTemplatesSchema(error)) {
      return jsonError(
        "Interview prep templates schema is not available yet. Please run latest database migrations.",
        500,
      );
    }
    if (error || !data) return jsonError("Prep template not found", 404);

    return jsonSuccess({ template: toTemplate(data as PrepTemplateRow) });
  } catch (err) {
    return handleApiError(err, "Failed to update interview prep template", {
      route: "PATCH /api/interview-prep/templates/[id]",
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
    const permission = await resolveManagePermission();
    if (!requireAuth(permission.ctx)) return jsonError("Unauthorized", 401);
    if (!permission.ctx.organisationId) return jsonError("No organisation context", 400);
    if (!permission.supabase || !permission.canManageTemplates) {
      return jsonError(
        "Prep template management is disabled for your role by company admin settings",
        403,
      );
    }

    const { data, error } = await permission.supabase
      .from("interview_prep_templates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organisation_id", permission.ctx.organisationId)
      .eq("is_active", true)
      .select("id")
      .single();

    if (isMissingInterviewPrepTemplatesSchema(error)) {
      return jsonError(
        "Interview prep templates schema is not available yet. Please run latest database migrations.",
        500,
      );
    }
    if (error || !data) return jsonError("Prep template not found", 404);

    return jsonSuccess({ ok: true, archivedTemplateId: id });
  } catch (err) {
    return handleApiError(err, "Failed to archive interview prep template", {
      route: "DELETE /api/interview-prep/templates/[id]",
    });
  }
}
