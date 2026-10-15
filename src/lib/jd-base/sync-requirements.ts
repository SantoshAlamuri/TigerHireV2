import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredJd } from "@/lib/fitscore/hybrid/structured-jd";

type RequirementRow = {
  jd_base_document_id: string;
  tier: "must_have" | "need_to_have" | "nice_to_have";
  kind: string;
  verifiable: boolean;
  text: string;
  weight: number | null;
};

function tierRows(
  jdBaseDocumentId: string,
  tier: RequirementRow["tier"],
  items: string[],
  verifiable: boolean,
): RequirementRow[] {
  return items
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      jd_base_document_id: jdBaseDocumentId,
      tier,
      kind: "other",
      verifiable,
      text,
      weight: tier === "need_to_have" ? 5 : null,
    }));
}

/** Replace jd_requirements from structured JD tiers (called on HM approval). */
export async function syncJdRequirementsFromStructuredJd(
  supabase: SupabaseClient,
  jdBaseDocumentId: string,
  structured: StructuredJd,
): Promise<void> {
  const rows: RequirementRow[] = [
    ...tierRows(jdBaseDocumentId, "must_have", structured.must_haves, true),
    ...tierRows(jdBaseDocumentId, "need_to_have", structured.need_to_haves, false),
    ...tierRows(jdBaseDocumentId, "nice_to_have", structured.nice_to_haves, false),
  ];

  const { error: delErr } = await supabase
    .from("jd_requirements")
    .delete()
    .eq("jd_base_document_id", jdBaseDocumentId);
  if (delErr) throw delErr;

  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from("jd_requirements").insert(rows);
  if (insErr) throw insErr;
}
