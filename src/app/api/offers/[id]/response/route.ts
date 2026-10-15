import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { offerResponseSchema } from "@/lib/validations/offers";
import { validateOrigin } from "@/lib/security/csrf";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { executeOfferCandidateResponse } from "@/lib/offers/offer-candidate-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/offers/[id]/response");
    if (errorResponse) return errorResponse;
    const parsed = offerResponseSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();

    const result = await executeOfferCandidateResponse(admin, {
      offerId: id,
      body: parsed.data,
      candidateUserId: ctx.userId,
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      requestIp: getRequestClientIp(request),
      auditChannel: "web",
      logRoute: "POST /api/offers/[id]/response",
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonSuccess({ offer: result.offer });
  } catch (err) {
    return handleApiError(err, "Failed to capture offer response", {
      route: "POST /api/offers/[id]/response",
    });
  }
}
