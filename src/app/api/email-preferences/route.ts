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
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { z } from "zod";

const PREFERENCE_KEYS = [
  "marketing",
  "job_alerts",
  "application_updates",
  "messages",
  "interview_reminders",
  "weekly_digest",
] as const;
const updateEmailPreferencesBodySchema = z
  .object({
    marketing: z.boolean().optional(),
    job_alerts: z.boolean().optional(),
    application_updates: z.boolean().optional(),
    messages: z.boolean().optional(),
    interview_reminders: z.boolean().optional(),
    weekly_digest: z.boolean().optional(),
  })
  .strict();

const EMAIL_PREFERENCES_SELECT_COLUMNS =
  "id, user_id, marketing, job_alerts, application_updates, messages, interview_reminders, weekly_digest, created_at, updated_at";

/**
 * GET /api/email-preferences
 * Get the current user's email preferences. Creates defaults if none exist.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();

    const { data: existing } = await supabase
      .from("email_preferences")
      .select(EMAIL_PREFERENCES_SELECT_COLUMNS)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (existing) {
      return jsonSuccess({ preferences: existing });
    }

    const { data: created, error } = await supabase
      .from("email_preferences")
      .insert({ user_id: ctx.userId })
      .select(EMAIL_PREFERENCES_SELECT_COLUMNS)
      .single();

    if (error) {
      logger.error("Failed to create email preferences", {
        error: String(error),
      });
      return jsonError("Failed to get preferences", 500);
    }

    return jsonSuccess({ preferences: created });
  } catch (err) {
    return handleApiError(err, "Failed to get preferences", {
      route: "GET /api/email-preferences",
    });
  }
}

/**
 * PATCH /api/email-preferences
 * Update the current user's email preferences.
 * Body: partial object of { marketing, job_alerts, application_updates, messages, interview_reminders, weekly_digest }
 */
export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsedBody = await parseJsonBody<Record<string, unknown>>(
      request,
      "PATCH /api/email-preferences",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const bodyParsed = updateEmailPreferencesBodySchema.safeParse(parsedBody.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    for (const key of PREFERENCE_KEYS) {
      if (typeof body[key] === "boolean") {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length <= 1) {
      return jsonError("At least one preference must be provided (boolean values only)", 422);
    }

    const supabase = await createSupabaseServerClient();

    const { data: existing } = await supabase
      .from("email_preferences")
      .select("id")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (!existing) {
      const insertData = { user_id: ctx.userId, ...updates };
      const { data: created, error } = await supabase
        .from("email_preferences")
        .insert(insertData)
        .select(EMAIL_PREFERENCES_SELECT_COLUMNS)
        .single();

      if (error) {
        logger.error("Failed to create email preferences", {
          error: String(error),
        });
        return jsonError("Failed to update preferences", 500);
      }
      return jsonSuccess({ preferences: created });
    }

    const { data, error } = await supabase
      .from("email_preferences")
      .update(updates)
      .eq("user_id", ctx.userId)
      .select(EMAIL_PREFERENCES_SELECT_COLUMNS)
      .single();

    if (error) {
      logger.error("Failed to update email preferences", {
        error: String(error),
      });
      return jsonError("Failed to update preferences", 500);
    }

    return jsonSuccess({ preferences: data });
  } catch (err) {
    return handleApiError(err, "Failed to update preferences", {
      route: "PATCH /api/email-preferences",
    });
  }
}
