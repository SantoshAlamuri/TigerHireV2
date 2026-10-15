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
import {
  AVAILABILITY_DECLARER_ROLES,
  isFutureWindow,
  listUserAvailabilityWindows,
} from "@/lib/interviews/interviewer-availability";

const querySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});

const createBodySchema = z.object({
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
  recurring_pattern: z.string().max(200).optional().nullable(),
});

/**
 * GET /api/me/availability — list current user's declared windows.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...AVAILABILITY_DECLARER_ROLES)) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("Organisation required", 403);

    const parsedQuery = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
    });
    if (!parsedQuery.success) return handleZodError(parsedQuery.error);

    const from = parsedQuery.data.from ? new Date(parsedQuery.data.from) : new Date();
    const to = parsedQuery.data.to
      ? new Date(parsedQuery.data.to)
      : new Date(from.getTime() + 56 * 24 * 60 * 60 * 1000);

    const supabase = await createSupabaseServerClient();
    const windows = await listUserAvailabilityWindows(supabase, {
      userId: ctx.userId,
      organisationId: ctx.organisationId,
      from,
      to,
    });

    return jsonSuccess({ windows });
  } catch (err) {
    return handleApiError(err, "Failed to load availability", {
      route: "GET /api/me/availability",
    });
  }
}

/**
 * POST /api/me/availability — create a window for the current user.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...AVAILABILITY_DECLARER_ROLES)) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("Organisation required", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/me/availability");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const startsAt = new Date(parsed.data.starts_at);
    const endsAt = new Date(parsed.data.ends_at);
    if (endsAt <= startsAt) return jsonError("ends_at must be after starts_at", 400);
    if (!isFutureWindow(startsAt.toISOString())) {
      return jsonError("Availability must start in the future", 400);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("interviewer_availability_windows")
      .insert({
        user_id: ctx.userId,
        organisation_id: ctx.organisationId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        notes: parsed.data.notes?.trim() || null,
        recurring_pattern: parsed.data.recurring_pattern?.trim() || null,
      })
      .select(
        "id, user_id, organisation_id, starts_at, ends_at, recurring_pattern, notes, is_active, created_at, updated_at",
      )
      .single();

    if (error) return jsonError("Failed to create availability window", 500);

    return jsonSuccess({ window: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create availability", {
      route: "POST /api/me/availability",
    });
  }
}
