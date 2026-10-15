/**
 * Meta WhatsApp `messages` field webhook — per-message delivery status payloads.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components#statuses-object
 */

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed";

export type WhatsAppMessageStatusUpdate = {
  waMessageId: string;
  recipientPhone: string;
  status: WhatsAppMessageStatus;
  timestamp: string | null;
  errorCode: number | null;
  errorTitle: string | null;
  errorMessage: string | null;
};

const VALID_STATUSES = new Set<WhatsAppMessageStatus>(["sent", "delivered", "read", "failed"]);

function pickFirstError(
  errors: unknown,
): { code: number | null; title: string | null; message: string | null } | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (!first || typeof first !== "object") return null;
  const obj = first as Record<string, unknown>;
  const code = typeof obj.code === "number" ? obj.code : null;
  const title = typeof obj.title === "string" ? obj.title : null;
  // Meta uses both `message` (deprecated) and `error_data.details` for the human-readable text.
  const errorData = obj.error_data;
  const details =
    errorData && typeof errorData === "object"
      ? (errorData as Record<string, unknown>).details
      : null;
  const message =
    typeof details === "string" ? details : typeof obj.message === "string" ? obj.message : null;
  return { code, title, message };
}

export function extractMessageStatusUpdates(body: unknown): WhatsAppMessageStatusUpdate[] {
  if (!body || typeof body !== "object") return [];
  const entry = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];

  const out: WhatsAppMessageStatusUpdate[] = [];
  for (const ent of entry) {
    if (!ent || typeof ent !== "object") continue;
    const changes = (ent as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const field = (change as { field?: string }).field;
      if (field && field !== "messages") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const statuses = (value as { statuses?: unknown }).statuses;
      if (!Array.isArray(statuses)) continue;

      for (const s of statuses) {
        if (!s || typeof s !== "object") continue;
        const obj = s as Record<string, unknown>;
        const id = typeof obj.id === "string" ? obj.id : "";
        const status = typeof obj.status === "string" ? obj.status : "";
        const recipientId = typeof obj.recipient_id === "string" ? obj.recipient_id : "";
        if (!id || !recipientId) continue;
        if (!VALID_STATUSES.has(status as WhatsAppMessageStatus)) continue;

        const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
        const err = pickFirstError(obj.errors);

        out.push({
          waMessageId: id,
          recipientPhone: recipientId.replace(/\D/g, ""),
          status: status as WhatsAppMessageStatus,
          timestamp: ts,
          errorCode: err?.code ?? null,
          errorTitle: err?.title ?? null,
          errorMessage: err?.message ?? null,
        });
      }
    }
  }
  return out;
}
