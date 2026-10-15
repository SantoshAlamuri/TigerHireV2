import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import type { CandidateJobPreferences } from "@/lib/preferences/types";
import {
  getCandidatePreferences,
  upsertCandidatePreferences,
} from "@/lib/preferences/get-preferences";

const preferencesSchema = z
  .object({
    preferred_locations: z.array(z.string()).optional(),
    remote_preference: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
    preferred_seniority: z.array(z.string()).optional(),
    preferred_role_functions: z.array(z.string()).optional(),
    salary_min_lpa: z.number().min(0).max(10000).nullable().optional(),
    salary_max_lpa: z.number().min(0).max(10000).nullable().optional(),
  })
  .strict();

/**
 * GET /api/candidates/me/preferences
 * Returns the current user's job preferences (as candidate).
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "candidate_pro", "candidate_free")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", ctx.userId)
      .single();

    if (!candidate) {
      return jsonSuccess({ preferences: null });
    }

    const preferences = await getCandidatePreferences(supabase, candidate.id);
    return jsonSuccess({ preferences: preferences ?? {} });
  } catch (err) {
    return handleApiError(err, "Failed to get preferences", {
      route: "GET /api/candidates/me/preferences",
    });
  }
}

/**
 * PATCH /api/candidates/me/preferences
 * Body: { preferred_locations?, remote_preference?, preferred_seniority?, preferred_role_functions?, salary_min_lpa?, salary_max_lpa? }
 */
export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "candidate_pro", "candidate_free")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", ctx.userId)
      .single();

    if (!candidate) {
      return jsonError("No candidate profile found. Complete your profile first.", 404);
    }

    const parsedBody = await parseJsonBody(request, "PATCH /api/candidates/me/preferences");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = preferencesSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const incoming = parsed.data as CandidateJobPreferences;
    const existing = await getCandidatePreferences(supabase, candidate.id);
    const merged: CandidateJobPreferences = {
      ...(existing ?? {}),
      ...incoming,
    };
    if (
      merged.salary_min_lpa != null &&
      merged.salary_max_lpa != null &&
      merged.salary_min_lpa > merged.salary_max_lpa
    ) {
      return jsonError("Maximum salary must be at least the minimum salary", 422);
    }

    await upsertCandidatePreferences(supabase, candidate.id, merged);
    return jsonSuccess({ preferences: merged });
  } catch (err) {
    return handleApiError(err, "Failed to update preferences", {
      route: "PATCH /api/candidates/me/preferences",
    });
  }
}
