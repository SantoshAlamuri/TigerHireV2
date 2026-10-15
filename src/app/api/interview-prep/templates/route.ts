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
import type {
  InterviewPrepTemplateLibraryResponse,
  PrepPackTemplate,
} from "@/lib/interview-prep/types";
import { interviewPrepTemplateSchema } from "@/lib/validations/interview-prep";
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

async function resolveTemplatePermissions() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx))
    return {
      ctx,
      allowedToRead: false as const,
      canManageTemplates: false as const,
      supabase: null,
    };
  if (!ctx.organisationId)
    return {
      ctx,
      allowedToRead: false as const,
      canManageTemplates: false as const,
      supabase: null,
    };

  const supabase = await createSupabaseServerClient();
  const allowedToRead = await hasAnyEnterpriseRole(
    ctx.userId,
    ["leadership", "recruiter", "hiring_manager", "interviewer", "super_admin"],
    supabase,
  );

  let canManageTemplates = false;
  if (allowedToRead) {
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    canManageTemplates =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(ctx.role, "manage_assessment_templates", permissions);
  }

  return { ctx, allowedToRead, canManageTemplates, supabase };
}

export async function GET() {
  try {
    const permission = await resolveTemplatePermissions();
    if (!requireAuth(permission.ctx)) return jsonError("Unauthorized", 401);
    if (!permission.ctx.organisationId) return jsonError("No organisation context", 400);
    if (!permission.allowedToRead || !permission.supabase) return jsonError("Forbidden", 403);

    const { data, error } = await permission.supabase
      .from("interview_prep_templates")
      .select(
        "id, role_function, stage_name, title, when_to_use, objective, question_tracks, rubric",
      )
      .eq("organisation_id", permission.ctx.organisationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingInterviewPrepTemplatesSchema(error)) {
        return jsonSuccess<InterviewPrepTemplateLibraryResponse>({
          templates: [],
          canManageTemplates: permission.canManageTemplates,
          warning:
            "Interview prep templates schema not available yet. Run the latest DB migrations.",
        });
      }
      return jsonSuccess<InterviewPrepTemplateLibraryResponse>({
        templates: [],
        canManageTemplates: permission.canManageTemplates,
        warning: "Prep templates could not be loaded from DB; showing live generated tracks only.",
      });
    }

    return jsonSuccess<InterviewPrepTemplateLibraryResponse>({
      templates: (data ?? []).map((row) => toTemplate(row as PrepTemplateRow)),
      canManageTemplates: permission.canManageTemplates,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch interview prep templates", {
      route: "GET /api/interview-prep/templates",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const permission = await resolveTemplatePermissions();
    if (!requireAuth(permission.ctx)) return jsonError("Unauthorized", 401);
    if (!permission.ctx.organisationId) return jsonError("No organisation context", 400);
    if (!permission.allowedToRead || !permission.supabase) return jsonError("Forbidden", 403);
    if (!permission.canManageTemplates) {
      return jsonError(
        "Prep template management is disabled for your role by company admin settings",
        403,
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/interview-prep/templates");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = interviewPrepTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { data, error } = await permission.supabase
      .from("interview_prep_templates")
      .insert({
        organisation_id: permission.ctx.organisationId,
        created_by: permission.ctx.userId,
        role_function: parsed.data.roleFunction?.trim() || null,
        stage_name: parsed.data.stageName?.trim() || null,
        title: parsed.data.title.trim(),
        when_to_use: parsed.data.whenToUse.trim(),
        objective: parsed.data.objective.trim(),
        question_tracks: parsed.data.questionTracks,
        rubric: parsed.data.rubric,
        is_active: true,
      })
      .select(
        "id, role_function, stage_name, title, when_to_use, objective, question_tracks, rubric",
      )
      .single();

    if (error || !data) {
      if (isMissingInterviewPrepTemplatesSchema(error)) {
        return jsonError(
          "Interview prep templates schema is not available yet. Please run latest database migrations.",
          500,
        );
      }
      return jsonError("Failed to create interview prep template", 500);
    }

    return jsonSuccess({ template: toTemplate(data as PrepTemplateRow) }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create interview prep template", {
      route: "POST /api/interview-prep/templates",
    });
  }
}
