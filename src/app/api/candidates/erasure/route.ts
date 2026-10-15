import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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
import { CandidateService } from "@/lib/services/CandidateService";
import { ConsentService } from "@/lib/services/ConsentService";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";

const adminErasureSchema = z
  .object({
    candidateId: z.string().uuid().optional(),
    phone: z.string().min(7).max(20).optional(),
  })
  .refine((d) => d.candidateId || d.phone, {
    message: "Provide candidateId or phone",
  });

/**
 * POST /api/candidates/erasure
 * Right to erasure (DPDP Act). Candidate or admin can request deletion of all PII.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsedBody = await parseJsonBody(request, "POST /api/candidates/erasure");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    let candidateId: string | undefined;
    let phone: string | undefined;

    if (hasRole(ctx, "candidate_pro", "candidate_free")) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("id, phone")
        .eq("user_id", ctx.userId)
        .single();

      if (!candidate) return jsonError("No candidate profile found", 404);
      candidateId = candidate.id;
      phone = candidate.phone;
    } else if (hasRole(ctx, "super_admin")) {
      const parsed = adminErasureSchema.safeParse(body);
      if (!parsed.success) {
        return handleZodError(parsed.error);
      }
      candidateId = parsed.data.candidateId;
      phone = parsed.data.phone;
    } else {
      return jsonError("Forbidden", 403);
    }

    const erasureRequest = await ConsentService.requestErasure(admin, candidateId, phone, "web");

    if (candidateId) {
      await CandidateService.eraseData(admin, candidateId);

      const { error: completionError } = await admin
        .from("erasure_requests")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", erasureRequest.id);
      if (completionError) throw new Error("Could not complete erasure request");
    }

    logger.info("Erasure request processed", {
      candidate_id: candidateId,
      user_id: ctx.userId,
    });

    return jsonSuccess({
      message: "Data erasure request processed",
      requestId: erasureRequest.id,
    });
  } catch (err) {
    return handleApiError(err, "Failed to process erasure request", {
      route: "POST /api/candidates/erasure",
    });
  }
}
