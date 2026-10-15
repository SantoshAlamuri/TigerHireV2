import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type { TemplateStatusEvent } from "./parse-template-status-webhook";

export type WhatsappTemplateStatusRow = {
  template_name: string;
  language: string;
  waba_id?: string | null;
  meta_template_id?: number | null;
  status: string;
  category?: string | null;
  rejection_reason?: string | null;
  last_event?: string | null;
  submitted_at?: string | null;
};

function normalizeStatus(event: string): string {
  const u = event.trim().toUpperCase();
  if (
    u === "APPROVED" ||
    u === "REJECTED" ||
    u === "PENDING" ||
    u === "PAUSED" ||
    u === "DISABLED"
  ) {
    return u;
  }
  return u || "UNKNOWN";
}

/**
 * Upsert template row after Meta Graph API submit (status usually PENDING).
 */
export async function upsertTemplateStatusFromApiSubmit(
  admin: SupabaseClient,
  row: WhatsappTemplateStatusRow,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_template_status").upsert(
    {
      template_name: row.template_name,
      language: row.language,
      waba_id: row.waba_id ?? null,
      meta_template_id: row.meta_template_id ?? null,
      status: normalizeStatus(row.status),
      category: row.category ?? null,
      rejection_reason: row.rejection_reason ?? null,
      last_event: row.last_event ?? "API_SUBMIT",
      submitted_at: row.submitted_at ?? now,
      status_updated_at: now,
    },
    { onConflict: "template_name,language" },
  );
  if (error) {
    logger.warn("whatsapp_template_status api upsert failed", {
      template_name: row.template_name,
      error: error.message,
    });
  }
}

/**
 * Upsert from Meta `message_template_status_update` webhook field.
 */
export async function upsertTemplateStatusFromWebhook(
  admin: SupabaseClient,
  event: TemplateStatusEvent,
  wabaId?: string | null,
): Promise<void> {
  const name = event.message_template_name?.trim();
  if (!name) return;

  const language = event.message_template_language?.trim() || "en";
  const now = new Date().toISOString();
  const rejection = event.rejection_reason ?? event.reason ?? null;

  const { error } = await admin.from("whatsapp_template_status").upsert(
    {
      template_name: name,
      language,
      waba_id: wabaId ?? null,
      meta_template_id: event.message_template_id ?? null,
      status: normalizeStatus(event.event),
      rejection_reason: rejection,
      last_event: event.event,
      status_updated_at: now,
    },
    { onConflict: "template_name,language" },
  );
  if (error) {
    logger.warn("whatsapp_template_status webhook upsert failed", {
      template_name: name,
      event: event.event,
      error: error.message,
    });
  }
}

export async function getTemplateStatus(
  admin: SupabaseClient,
  templateName: string,
  language = "en",
): Promise<{ status: string; rejection_reason: string | null } | null> {
  const { data, error } = await admin
    .from("whatsapp_template_status")
    .select("status, rejection_reason")
    .eq("template_name", templateName)
    .eq("language", language)
    .maybeSingle();

  if (error || !data) return null;
  return {
    status: data.status as string,
    rejection_reason: (data.rejection_reason as string | null) ?? null,
  };
}
