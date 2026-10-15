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
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { EmployeeService } from "@/lib/services/EmployeeService";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";

const disputeBodySchema = z
  .object({
    resignationId: z.string().min(1, "resignationId is required"),
    reason: z.string().min(1, "reason is required"),
  })
  .strict();

/**
 * POST /api/employees/resign/dispute -- company admin disputes a resignation within 48hr window.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/employees/resign/dispute");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = disputeBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { resignationId, reason } = parsed.data;

    const supabase = await createSupabaseServerClient();
    await EmployeeService.disputeResignation(supabase, resignationId, ctx.userId, reason);

    return jsonSuccess({
      message: "Resignation disputed. Profile unlock has been paused pending review.",
    });
  } catch (err) {
    return handleApiError(err, "Failed to dispute resignation", {
      route: "POST /api/employees/resign/dispute",
    });
  }
}
