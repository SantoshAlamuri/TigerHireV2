import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export async function insertGeneratedOfferDocumentVersion(
  admin: SupabaseClient,
  offerId: string,
  contentHash: string,
  generatedBy: string | null,
): Promise<void> {
  const { count, error: cErr } = await admin
    .from("offer_document_versions")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId)
    .eq("kind", "generated");

  if (cErr) {
    logger.warn("insertGeneratedOfferDocumentVersion: count failed", { error: cErr.message });
    return;
  }

  const n = (count ?? 0) + 1;
  const { error } = await admin.from("offer_document_versions").insert({
    offer_id: offerId,
    version_label: `generated-${n}`,
    content_hash: contentHash,
    kind: "generated",
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
  });

  if (error) {
    logger.warn("insertGeneratedOfferDocumentVersion: insert failed", {
      offerId,
      error: error.message,
    });
  }
}

/**
 * B2: signed PDF from e-sign provider is stored as version label `1`.
 */
export async function upsertSignedOfferDocumentVersion(
  admin: SupabaseClient,
  offerId: string,
  documentUrl: string | null,
  generatedAt: string,
): Promise<void> {
  const { error } = await admin.from("offer_document_versions").upsert(
    {
      offer_id: offerId,
      version_label: "1",
      document_url: documentUrl,
      content_hash: null,
      kind: "signed",
      generated_at: generatedAt,
      generated_by: null,
    },
    { onConflict: "offer_id,version_label" },
  );

  if (error) {
    logger.warn("upsertSignedOfferDocumentVersion failed", {
      offerId,
      error: error.message,
    });
  }
}
