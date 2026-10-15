import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { ProfileService } from "@/lib/services/ProfileService";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { profilePatchSchema } from "@/lib/validations/candidates";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const result = await ProfileService.get(supabase, ctx.userId, ctx.role);
    if (!result.profile) return jsonError("Profile not found", 404);

    return jsonSuccess(result);
  } catch (err) {
    return handleApiError(err, "Failed to fetch profile", {
      route: "GET /api/profiles",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { body, errorResponse } = await parseJsonBody(request, "PATCH /api/profiles");
    if (errorResponse) return errorResponse;

    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const result = await ProfileService.update(supabase, ctx.userId, ctx.role, parsed.data);

    return jsonSuccess(result);
  } catch (err) {
    return handleApiError(err, "Failed to update profile", {
      route: "PATCH /api/profiles",
    });
  }
}
