import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateOrigin } from "@/lib/security/csrf";
import { claimCandidateByToken } from "@/lib/candidates/claim-token";

const claimSchema = z.object({ token: z.string().trim().min(1).max(200) });

const CANDIDATE_ROLES = new Set(["candidate_free", "candidate_pro", "super_admin"]);

/**
 * Bind an unclaimed (apply-flow) candidate profile to the authenticated user via
 * a one-time claim token (B2.2). Requires an authenticated candidate; the token
 * is the proof of ownership (the applicant received the link).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!CANDIDATE_ROLES.has(ctx.role)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/candidates/claim");
    if (errorResponse) return errorResponse;
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const result = await claimCandidateByToken(
      createSupabaseAdmin(),
      parsed.data.token,
      ctx.userId,
    );
    if (!result.ok) {
      if (result.reason === "expired") {
        return jsonError("This claim link has expired.", 410);
      }
      if (result.reason === "already_has_profile") {
        // Not an error for the user — they already have a profile on this account.
        return jsonSuccess({ claimed: false, alreadyHadProfile: true });
      }
      return jsonError("This claim link is not valid.", 404);
    }

    return jsonSuccess({ claimed: true });
  } catch (err) {
    return handleApiError(err, "Failed to claim profile", {
      route: "POST /api/candidates/claim",
    });
  }
}
