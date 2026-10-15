import { NextRequest } from "next/server";
import { handleApiError, handleZodError, jsonSuccess, parseJsonBody } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { privacySettingsSchema } from "@/lib/validations/integrations";
import {
  getPrivacySettings,
  upsertPrivacySettings,
  writeAuditLog,
} from "@/lib/repositories/integrations.repository";
import { isMissingTableError } from "@/lib/settings/error-utils";
import { validateOrigin } from "@/lib/security/csrf";

const DEFAULT_PRIVACY_SETTINGS = {
  consent_message:
    "This interview will be recorded and transcribed by TigerHire to help evaluate your application. By clicking Continue, you consent to this recording. You may request deletion of your data at any time.",
  recording_retention_days: 90,
  transcript_retention_days: 365,
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "view_settings" });
    if (auth.error) return auth.error;

    const supabase = await createSupabaseServerClient();
    const row = await getPrivacySettings(supabase, auth.context.organisationId);

    return jsonSuccess({
      privacySettings: row ?? {
        organisation_id: auth.context.organisationId,
        ...DEFAULT_PRIVACY_SETTINGS,
      },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      const auth = await requireSettingsAdmin(request, { capability: "view_settings" });
      if (auth.error) return auth.error;
      return jsonSuccess({
        privacySettings: {
          organisation_id: auth.context.organisationId,
          ...DEFAULT_PRIVACY_SETTINGS,
        },
        migrationRequired: true,
      });
    }
    return handleApiError(err, "Failed to load privacy settings", {
      route: "GET /api/settings/privacy",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_privacy",
    });
    if (auth.error) return auth.error;

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/settings/privacy");
    if (errorResponse) return errorResponse;
    const parsed = privacySettingsSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const row = await upsertPrivacySettings(supabase, auth.context.organisationId, parsed.data);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "privacy.updated",
      resource_type: "privacy_settings",
      resource_id: auth.context.organisationId,
      metadata: {
        recordingRetentionDays: parsed.data.recordingRetentionDays,
        transcriptRetentionDays: parsed.data.transcriptRetentionDays,
      },
      ip_address: ip,
    });

    return jsonSuccess({ privacySettings: row });
  } catch (err) {
    return handleApiError(err, "Failed to save privacy settings", {
      route: "POST /api/settings/privacy",
    });
  }
}
