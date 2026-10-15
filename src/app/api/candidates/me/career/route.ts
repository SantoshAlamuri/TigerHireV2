import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { careerProfileSaveSchema } from "@/lib/candidate/career-profile";

async function context() {
  const supabase = await createSupabaseServerClient();
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return { response: jsonError("Unauthorized", 401) };
  if (!hasRole(ctx, "candidate_free", "candidate_pro")) {
    return { response: jsonError("Forbidden", 403) };
  }
  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw error;
  return { supabase, candidate };
}

export async function GET() {
  try {
    const ctx = await context();
    if (ctx.response) return ctx.response;
    if (!ctx.candidate) return jsonSuccess({ career: null });
    const { data, error } = await ctx.supabase
      .from("candidate_career_profiles")
      .select("document, updated_at")
      .eq("candidate_id", ctx.candidate.id)
      .maybeSingle();
    if (error) throw error;
    const response = jsonSuccess({ career: data });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleApiError(error, "Could not load career details", {
      route: "GET /api/candidates/me/career",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await context();
    if (ctx.response) return ctx.response;
    if (!ctx.candidate) return jsonError("Save your personal details first", 404);
    const body = await parseJsonBody(request, "PATCH /api/candidates/me/career");
    if (body.errorResponse) return body.errorResponse;
    const parsed = careerProfileSaveSchema.safeParse(body.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { document, expectedUpdatedAt } = parsed.data;
    const table = ctx.supabase.from("candidate_career_profiles");
    // A stale editor must not overwrite newer changes from another tab.
    const query =
      expectedUpdatedAt === null
        ? table.insert({ candidate_id: ctx.candidate.id, document })
        : table
            .update({ document })
            .eq("candidate_id", ctx.candidate.id)
            .eq("updated_at", expectedUpdatedAt);
    const { data, error } = await query.select("document, updated_at").maybeSingle();
    if (error?.code === "23505" || (!error && !data)) {
      return jsonError(
        "Career details changed in another tab. Reload the saved version before saving again.",
        409,
      );
    }
    if (error) throw error;
    return jsonSuccess({ career: data });
  } catch (error) {
    return handleApiError(error, "Could not save career details", {
      route: "PATCH /api/candidates/me/career",
    });
  }
}
