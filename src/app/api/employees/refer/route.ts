import { NextRequest } from "next/server";
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
import { ReferCandidateSchema } from "@/lib/security/validate";
import { assertJobOwnership } from "@/lib/security/tenancy";
import { ForbiddenError } from "@/lib/security/tenancy";
import { EmployeeService } from "@/lib/services/EmployeeService";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveReferrerIdForUser } from "@/lib/referrers/resolve-referrer-id";
import { validateOrigin } from "@/lib/security/csrf";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No company associated", 400);

    const parsedBody = await parseJsonBody(request, "POST /api/employees/refer");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = ReferCandidateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    await assertJobOwnership(parsed.data.job_id, ctx.organisationId);

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const directReferrerId = await resolveReferrerIdForUser(admin, ctx.userId);
    const referral = await EmployeeService.refer(
      supabase,
      ctx.userId,
      ctx.organisationId,
      {
        jobId: parsed.data.job_id,
        candidatePhone: parsed.data.candidate_phone,
        candidateName: parsed.data.candidate_name,
      },
      { directReferrerId },
    );

    return jsonSuccess(
      {
        referral: referral.referral,
        whatsapp: referral.whatsapp,
      },
      201,
    );
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return jsonError(err.message, 403);
    }
    if (err instanceof Error && err.message.includes("valid Indian WhatsApp")) {
      return jsonError(err.message, 400);
    }
    return handleApiError(err, "Failed to create referral", {
      route: "POST /api/employees/refer",
    });
  }
}
