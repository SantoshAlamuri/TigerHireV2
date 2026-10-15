// Allow up to 5 min so CV parse + per-job fit scoring can finish (Vercel Pro).
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { cacheDel } from "@/lib/redis/cache";
import { myPipelineKey } from "@/lib/redis/keys";
import {
  AgencyReprocessJdNotApprovedError,
  reprocessAgencyCandidate,
} from "@/lib/agency/reprocess-candidate";

/**
 * POST /api/agency/reprocess-candidates
 *
 * Re-processes pending candidates by downloading their stored CV from
 * Supabase Storage, extracting text, parsing with Claude, and scoring.
 *
 * Body: JSON { candidateIds: [string] } — exactly one id per request to avoid timeouts.
 * No file re-upload needed — CVs are read from the candidate-cvs bucket.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation linked", 400);

    const parsedBody = await parseJsonBody<{ candidateIds?: string[] }>(
      request,
      "POST /api/agency/reprocess-candidates",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;

    const candidateIds = body.candidateIds;
    if (!Array.isArray(candidateIds) || candidateIds.length === 0)
      return jsonError("candidateIds array is required", 400);
    if (candidateIds.length > 1)
      return jsonError(
        "Only 1 candidate per request is supported to avoid timeouts. Call the endpoint once per candidate.",
        400,
      );

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    const clientOrgIds = (links ?? []).map(
      (l: { client_organisation_id: string }) => l.client_organisation_id,
    );

    const results = [];

    for (const candidateId of candidateIds) {
      try {
        const result = await reprocessAgencyCandidate(admin, {
          candidateId,
          agencyOrganisationId: ctx.organisationId,
          clientOrgIds,
          triggeredByUserId: ctx.userId,
        });
        results.push(result);
      } catch (err) {
        if (err instanceof AgencyReprocessJdNotApprovedError) {
          return jsonError(err.message, 428);
        }
        throw err;
      }
    }

    await cacheDel(myPipelineKey(ctx.userId));

    return jsonSuccess({ results });
  } catch (err) {
    return handleApiError(err, "Failed to reprocess candidates", {
      route: "POST /api/agency/reprocess-candidates",
    });
  }
}
