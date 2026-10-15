import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { downloadWhatsAppMedia } from "./media";

/**
 * Partner-intake inbox for the dedicated intake WhatsApp number (Apna resume
 * forwarding). Senders on this number are partners forwarding candidate CVs —
 * never candidates — so nothing here may touch whatsapp_sessions, prescreen, or
 * the candidate bot. Documents land in whatsapp_intake_items; processing pushes
 * them through the existing POST /api/intake/email pipeline, which owns candidate
 * creation, screening-question kickoff, JD-approval gating, and FitScore.
 */

const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_EXTENSIONS = /\.(pdf|docx?)$/i;
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const STORAGE_BUCKET = "resumes";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface IntakeDocumentMessage {
  wa_message_id: string;
  sender_phone: string;
  media_id: string;
  filename: string;
  mime_type: string;
  caption: string;
}

export function isResumeDocument(args: { mime_type?: string; filename?: string }): boolean {
  if (args.mime_type && RESUME_MIME_TYPES.has(args.mime_type)) return true;
  return Boolean(args.filename && RESUME_EXTENSIONS.test(args.filename));
}

/**
 * Walk the raw Meta webhook body (entry[].changes[].value) and collect document
 * messages addressed to the given intake phone_number_id. The normalizer used by
 * the candidate bot drops metadata, so intake works from the raw payload.
 */
export function extractIntakeDocuments(
  rawBody: unknown,
  intakePhoneNumberId: string,
): IntakeDocumentMessage[] {
  if (!intakePhoneNumberId) return [];
  const out: IntakeDocumentMessage[] = [];
  for (const entry of asArray(asRecord(rawBody).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const phoneNumberId = String(asRecord(value.metadata).phone_number_id ?? "");
      if (phoneNumberId !== intakePhoneNumberId) continue;
      for (const message of asArray(value.messages)) {
        const msg = asRecord(message);
        if (String(msg.type ?? "") !== "document") continue;
        const doc = asRecord(msg.document);
        const mediaId = String(doc.id ?? "").trim();
        const waMessageId = String(msg.id ?? "").trim();
        if (!mediaId || !waMessageId) continue;
        const filename = String(doc.filename ?? "").trim() || "resume.pdf";
        const mimeType = String(doc.mime_type ?? "").trim();
        if (!isResumeDocument({ mime_type: mimeType, filename })) continue;
        out.push({
          wa_message_id: waMessageId,
          sender_phone: String(msg.from ?? "").trim(),
          media_id: mediaId,
          filename,
          mime_type: mimeType || "application/pdf",
          caption: String(doc.caption ?? "").trim(),
        });
      }
    }
  }
  return out;
}

/** True when the webhook body carries any message for the configured intake number. */
export function isIntakeWebhookPayload(rawBody: unknown): boolean {
  const intakeId = env.whatsappIntakePhoneNumberId;
  if (!intakeId) return false;
  for (const entry of asArray(asRecord(rawBody).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const phoneNumberId = String(asRecord(value.metadata).phone_number_id ?? "");
      if (phoneNumberId === intakeId && asArray(value.messages).length > 0) return true;
    }
  }
  return false;
}

/** Job attribution from the forward caption: any UUID in the text is treated as a job id. */
export function extractJobIdFromCaption(caption: string): string | null {
  const match = caption.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "resume.pdf";
}

/**
 * Ingest all intake documents in a webhook body: insert inbox rows (idempotent on
 * wa_message_id), download + store the file, then auto-process when the caption
 * carries a job id. Per-document failures are recorded on the row, never thrown —
 * one bad forward must not block the batch.
 */
export async function handleIntakeInboundWebhook(rawBody: unknown): Promise<void> {
  const intakeId = env.whatsappIntakePhoneNumberId;
  const documents = extractIntakeDocuments(rawBody, intakeId);
  if (documents.length === 0) return;

  const admin = createSupabaseAdmin();
  for (const doc of documents) {
    try {
      const { data: inserted, error: insertError } = await admin
        .from("whatsapp_intake_items")
        .insert({
          sender_phone: doc.sender_phone,
          wa_message_id: doc.wa_message_id,
          media_id: doc.media_id,
          filename: doc.filename,
          mime_type: doc.mime_type,
          caption: doc.caption || null,
        })
        .select("id")
        .maybeSingle<{ id: string }>();
      if (insertError) {
        // 23505 = Meta retry already inserted this message; nothing to do.
        if ((insertError as { code?: string }).code === "23505") continue;
        throw insertError;
      }
      if (!inserted) continue;

      const buffer = await downloadWhatsAppMedia(doc.media_id);
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_RESUME_BYTES) {
        await markItemFailed(admin, inserted.id, `invalid file size: ${buffer.byteLength} bytes`);
        continue;
      }

      const storagePath = `whatsapp-intake/${inserted.id}/${sanitizeFilename(doc.filename)}`;
      const { error: uploadError } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, { contentType: doc.mime_type, upsert: true });
      if (uploadError) {
        await markItemFailed(admin, inserted.id, `storage upload: ${uploadError.message}`);
        continue;
      }

      await admin
        .from("whatsapp_intake_items")
        .update({
          storage_path: storagePath,
          status: "stored",
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);

      logger.info("whatsapp_intake_item_stored", {
        event_name: "whatsapp_intake_item_stored",
        itemId: inserted.id,
        filename: doc.filename,
        bytes: buffer.byteLength,
      });

      const jobId = extractJobIdFromCaption(doc.caption);
      if (jobId) {
        await admin
          .from("whatsapp_intake_items")
          .update({ job_id: jobId, updated_at: new Date().toISOString() })
          .eq("id", inserted.id);
        await processIntakeItem({ admin, itemId: inserted.id, jobId }).catch((err) => {
          logger.warn("whatsapp_intake_autoprocess_failed", {
            itemId: inserted.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.error("whatsapp_intake_ingest_failed", {
        wa_message_id: doc.wa_message_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function markItemFailed(admin: SupabaseClient, itemId: string, error: string): Promise<void> {
  await admin
    .from("whatsapp_intake_items")
    .update({ status: "failed", error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", itemId);
}

type IntakeItemRow = {
  id: string;
  status: string;
  storage_path: string | null;
  filename: string | null;
  mime_type: string | null;
  caption: string | null;
  sender_phone: string;
};

/**
 * Push a stored inbox item through POST /api/intake/email for the given job.
 * Reuses the exact pipeline the Resend email bridge uses, so gating, screening
 * kickoff, and FitScore behave identically across intake channels.
 */
export async function processIntakeItem(args: {
  admin: SupabaseClient;
  itemId: string;
  jobId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { admin, itemId, jobId } = args;
  const { data: item, error: itemError } = await admin
    .from("whatsapp_intake_items")
    .select("id, status, storage_path, filename, mime_type, caption, sender_phone")
    .eq("id", itemId)
    .maybeSingle<IntakeItemRow>();
  if (itemError) return { ok: false, error: itemError.message };
  if (!item) return { ok: false, error: "intake item not found" };
  if (item.status === "processed") return { ok: true };
  if (!item.storage_path) return { ok: false, error: "file not stored yet" };

  const { data: file, error: downloadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(item.storage_path);
  if (downloadError || !file) {
    const message = `storage download: ${downloadError?.message ?? "empty file"}`;
    await markItemFailed(admin, itemId, message);
    return { ok: false, error: message };
  }

  const intakeSecret = (process.env.EMAIL_INTAKE_SECRET ?? "").trim();
  if (!intakeSecret) {
    return { ok: false, error: "EMAIL_INTAKE_SECRET not configured" };
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    return { ok: false, error: "NEXT_PUBLIC_APP_URL not configured" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const res = await fetch(`${base}/api/intake/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-intake-secret": intakeSecret },
    body: JSON.stringify({
      to: `jobs+${jobId}@in.tigerhire.io`,
      jobId,
      subject: item.caption ?? undefined,
      resumeBase64: buffer.toString("base64"),
      fileName: item.filename ?? "resume.pdf",
      contentType: item.mime_type ?? "application/pdf",
    }),
  });
  const resBody = (await res.json().catch(() => ({}))) as {
    candidateId?: string;
    error?: string;
  };

  if (!res.ok) {
    const message = `intake pipeline ${res.status}: ${resBody.error ?? "unknown"}`;
    await markItemFailed(admin, itemId, message);
    return { ok: false, error: message };
  }

  await admin
    .from("whatsapp_intake_items")
    .update({
      status: "processed",
      job_id: jobId,
      candidate_id: resBody.candidateId ?? null,
      error: null,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  logger.info("whatsapp_intake_item_processed", {
    event_name: "whatsapp_intake_item_processed",
    itemId,
    jobId,
    candidateId: resBody.candidateId ?? null,
  });
  return { ok: true };
}
