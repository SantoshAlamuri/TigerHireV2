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
} from "@/lib/interviews/interviewer-availability";

const paramsSchema = z.object({ id: z.string().uuid() });

const patchBodySchema = z
  .object({
    starts_at: z.string().min(1).optional(),
    ends_at: z.string().min(1).optional(),
    notes: z.string().max(2000).optional().nullable(),
    recurring_pattern: z.string().max(200).optional().nullable(),
  })
  .strict();

async function loadOwnWindow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  windowId: string,
) {
  const { data, error } = await supabase
    .from("interviewer_availability_windows")
    .select(
      "id, user_id, organisation_id, starts_at, ends_at, recurring_pattern, notes, is_active, created_at, updated_at",
    )
    .eq("id", windowId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * PATCH /api/me/availability/[id] — edit a future window owned by the current user.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...AVAILABILITY_DECLARER_ROLES)) return jsonError("Forbidden", 403);

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return jsonError("Invalid window id", 400);

    const parsedBody = await parseJsonBody(request, "PATCH /api/me/availability/[id]");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = patchBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const existing = await loadOwnWindow(supabase, ctx.userId, parsedParams.data.id);
    if (!existing) return jsonError("Window not found", 404);
    if (!existing.is_active) return jsonError("Window is no longer active", 410);
    if (!isFutureWindow(existing.starts_at as string)) {
      return jsonError("Past windows are read-only", 403);
    }

    const startsAt = parsed.data.starts_at
      ? new Date(parsed.data.starts_at)
      : new Date(existing.starts_at as string);
    const endsAt = parsed.data.ends_at
      ? new Date(parsed.data.ends_at)
      : new Date(existing.ends_at as string);
    if (endsAt <= startsAt) return jsonError("ends_at must be after starts_at", 400);
    if (!isFutureWindow(startsAt.toISOString())) {
      return jsonError("Availability must start in the future", 400);
    }

    const { data, error } = await supabase
      .from("interviewer_availability_windows")
      .update({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        notes:
          parsed.data.notes !== undefined
            ? parsed.data.notes?.trim() || null
            : (existing.notes as string | null),
        recurring_pattern:
          parsed.data.recurring_pattern !== undefined
            ? parsed.data.recurring_pattern?.trim() || null
            : (existing.recurring_pattern as string | null),
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsedParams.data.id)
      .eq("user_id", ctx.userId)
      .select(
        "id, user_id, organisation_id, starts_at, ends_at, recurring_pattern, notes, is_active, created_at, updated_at",
      )
      .single();

    if (error) return jsonError("Failed to update window", 500);
    return jsonSuccess({ window: data });
  } catch (err) {
    return handleApiError(err, "Failed to update availability", {
      route: "PATCH /api/me/availability/[id]",
    });
  }
}

/**
 * DELETE /api/me/availability/[id] — soft-delete (is_active = false).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(_request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...AVAILABILITY_DECLARER_ROLES)) return jsonError("Forbidden", 403);

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return jsonError("Invalid window id", 400);

    const supabase = await createSupabaseServerClient();
    const existing = await loadOwnWindow(supabase, ctx.userId, parsedParams.data.id);
    if (!existing) return jsonError("Window not found", 404);
    if (!isFutureWindow(existing.starts_at as string)) {
      return jsonError("Past windows cannot be deleted", 403);
    }

    const { error } = await supabase
      .from("interviewer_availability_windows")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", parsedParams.data.id)
      .eq("user_id", ctx.userId);

    if (error) return jsonError("Failed to delete window", 500);
    return jsonSuccess({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete availability", {
      route: "DELETE /api/me/availability/[id]",
    });
  }
}
