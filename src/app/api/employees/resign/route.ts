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

const resignBodySchema = z
  .object({
    candidateId: z.string().min(1).optional(),
  })
  .strict();

/**
 * GET /api/employees/resign — List pending resignations for the current org (leadership only).
 * Returns resignations in the 48h window that have not been disputed.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation", 400);

    const supabase = await createSupabaseServerClient();
    const now = new Date().toISOString();

    const { data: events, error } = await supabase
      .from("resignation_events")
      .select(
        "id, candidate_id, declared_by, created_at, profile_unlock_scheduled_at, disputed, candidates(id, employer_company_id)",
      )
      .eq("disputed", false)
      .gt("profile_unlock_scheduled_at", now);

    if (error) return jsonError("Failed to fetch resignations", 500);

    // Filter to only those where candidate's employer is current org
    const orgEvents = (events ?? []).filter((e) => {
      const cand = e.candidates as { employer_company_id?: string } | null;
      return cand?.employer_company_id === ctx.organisationId;
    });

    return jsonSuccess({
      resignations: orgEvents.map((e) => ({
        id: e.id,
        candidate_id: e.candidate_id,
        declared_by: e.declared_by,
        created_at: e.created_at,
        profile_unlock_scheduled_at: e.profile_unlock_scheduled_at,
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to list resignations", {
      route: "GET /api/employees/resign",
    });
  }
}

/**
 * POST /api/employees/resign -- self-declare resignation (48hr hold before profile unlock).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/employees/resign");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = resignBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    let candidateId = parsed.data.candidateId;

    const supabase = await createSupabaseServerClient();

    if (!candidateId) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("user_id", ctx.userId)
        .single();
      if (!candidate) return jsonError("No candidate profile linked to your account", 400);
      candidateId = candidate.id;
    }

    const resignation = await EmployeeService.declareResignation(
      supabase,
      candidateId!,
      ctx.userId,
    );

    return jsonSuccess(
      {
        resignation,
        message:
          "Resignation declared. Your profile will be visible to other companies after a 48-hour hold.",
      },
      201,
    );
  } catch (err) {
    return handleApiError(err, "Failed to declare resignation", {
      route: "POST /api/employees/resign",
    });
  }
}
