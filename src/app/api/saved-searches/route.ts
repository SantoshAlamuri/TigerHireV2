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

const createSavedSearchBodySchema = z
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
 * GET /api/saved-searches
 * List all saved searches for the current user.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_searches")
      .select(SAVED_SEARCHES_SELECT_COLUMNS)
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch saved searches", { error: String(error) });
      return jsonError("Failed to fetch saved searches", 500);
    }

    return jsonSuccess({ searches: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch saved searches", {
      route: "GET /api/saved-searches",
    });
  }
}

/**
 * POST /api/saved-searches
 * Save a new search. Body: { name: string, filters: object, alert_enabled?: boolean, alert_frequency?: string }
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsed = await parseJsonBody<{
      name?: string;
      filters?: Record<string, unknown>;
      alert_enabled?: boolean;
      alert_frequency?: string;
    }>(request, "POST /api/saved-searches");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = createSavedSearchBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return jsonError("name is required", 422);
    }
    if (!body.filters || typeof body.filters !== "object") {
      return jsonError("filters object is required", 422);
    }

    const validFreqs = ["daily", "weekly", "never"];
    const freq = body.alert_frequency ?? "weekly";
    if (!validFreqs.includes(freq)) {
      return jsonError("alert_frequency must be daily, weekly, or never", 422);
    }

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("saved_searches")
      .insert({
        user_id: ctx.userId,
        name: body.name.trim(),
        filters: body.filters,
        alert_enabled: body.alert_enabled ?? false,
        alert_frequency: freq,
      })
      .select(SAVED_SEARCHES_SELECT_COLUMNS)
      .single();

    if (error) {
      logger.error("Failed to save search", { error: String(error) });
      return jsonError("Failed to save search", 500);
    }

    return jsonSuccess({ search: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to save search", {
      route: "POST /api/saved-searches",
    });
  }
}
