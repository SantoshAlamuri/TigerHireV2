import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };
const updateSavedSearchBodySchema = z
  .object({
    name: z.string().optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
    alert_enabled: z.boolean().optional(),
    alert_frequency: z.string().optional(),
  })
  .strict();

const SAVED_SEARCHES_SELECT_COLUMNS =
  "id, user_id, name, filters, alert_enabled, alert_frequency, last_alerted_at, created_at, updated_at";

/**
 * GET /api/saved-searches/[id]
 * Get a specific saved search.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("saved_searches")
      .select(SAVED_SEARCHES_SELECT_COLUMNS)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .single();

    if (error || !data) return jsonError("Saved search not found", 404);

    return jsonSuccess({ search: data });
  } catch (err) {
    return handleApiError(err, "Failed to fetch saved search", {
      route: "GET /api/saved-searches/[id]",
    });
  }
}

/**
 * PATCH /api/saved-searches/[id]
 * Update a saved search: name, filters, alert settings.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await context.params;

    const parsed = await parseJsonBody<{
      name?: string;
      filters?: Record<string, unknown>;
      alert_enabled?: boolean;
      alert_frequency?: string;
    }>(request, "PATCH /api/saved-searches/[id]");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = updateSavedSearchBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.filters !== undefined) updates.filters = body.filters;
    if (body.alert_enabled !== undefined) updates.alert_enabled = body.alert_enabled;
    if (body.alert_frequency !== undefined) {
      const validFreqs = ["daily", "weekly", "never"];
      if (!validFreqs.includes(body.alert_frequency)) {
        return jsonError("alert_frequency must be daily, weekly, or never", 422);
      }
      updates.alert_frequency = body.alert_frequency;
    }

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("saved_searches")
      .update(updates)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select(SAVED_SEARCHES_SELECT_COLUMNS)
      .single();

    if (error || !data) {
      logger.error("Failed to update saved search", { error: String(error) });
      return jsonError("Saved search not found", 404);
    }

    return jsonSuccess({ search: data });
  } catch (err) {
    return handleApiError(err, "Failed to update saved search", {
      route: "PATCH /api/saved-searches/[id]",
    });
  }
}

/**
 * DELETE /api/saved-searches/[id]
 * Delete a saved search.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId);

    if (error) {
      logger.error("Failed to delete saved search", { error: String(error) });
      return jsonError("Failed to delete saved search", 500);
    }

    return jsonSuccess({ deleted: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete saved search", {
      route: "DELETE /api/saved-searches/[id]",
    });
  }
}
