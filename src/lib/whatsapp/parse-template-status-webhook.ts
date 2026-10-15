/**
 * Meta `message_template_status_update` webhook payloads.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/message_template_status_update/
 */

export type TemplateStatusEvent = {
  event: string;
  message_template_id?: number;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string | null;
  rejection_reason?: string | null;
};

export function extractTemplateStatusUpdates(body: unknown): TemplateStatusEvent[] {
  if (!body || typeof body !== "object") return [];

  const entry = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];

  const out: TemplateStatusEvent[] = [];

  for (const ent of entry) {
    if (!ent || typeof ent !== "object") continue;
    const changes = (ent as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const field = (change as { field?: string }).field;
      if (field !== "message_template_status_update") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;

      const v = value as Record<string, unknown>;
      const event = typeof v.event === "string" ? v.event : "";
      if (!event) continue;

      out.push({
        event,
        message_template_id:
          typeof v.message_template_id === "number" ? v.message_template_id : undefined,
        message_template_name:
          typeof v.message_template_name === "string" ? v.message_template_name : undefined,
        message_template_language:
          typeof v.message_template_language === "string" ? v.message_template_language : undefined,
        reason: typeof v.reason === "string" ? v.reason : null,
        rejection_reason: typeof v.rejection_reason === "string" ? v.rejection_reason : null,
      });
    }
  }

  return out;
}
