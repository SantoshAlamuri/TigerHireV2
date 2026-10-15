import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassificationValidationResult = { ok: true } | { ok: false; error: string };

export async function validateHiringRequestClassificationAgainstBands(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    roleLevel: string | null;
    budgetCtcMin: number | null;
    budgetCtcMax: number | null;
  },
): Promise<ClassificationValidationResult> {
  const { data: bands, error } = await supabase
    .from("compensation_bands")
    .select("label, min_amount, max_amount, is_active")
    .eq("organisation_id", params.organisationId)
    .eq("is_active", true)
    .limit(200);

  if (error) {
    return { ok: false, error: "Failed to validate role level against compensation bands" };
  }
  if (!bands || bands.length === 0) return { ok: true };

  const roleLevel = (params.roleLevel ?? "").trim();
  if (!roleLevel) {
    // Progressive disclosure: default path does not require classification upfront.
    return { ok: true };
  }

  const matchedBand = bands.find(
    (b) => String(b.label ?? "").toLowerCase() === roleLevel.toLowerCase(),
  );
  if (!matchedBand) {
    const allowed = bands.map((b) => String(b.label)).join(", ");
    return {
      ok: false,
      error: `Role level "${roleLevel}" does not match a configured compensation band (${allowed})`,
    };
  }

  const bandMin = Number(matchedBand.min_amount);
  const bandMax = Number(matchedBand.max_amount);
  if (params.budgetCtcMin != null && params.budgetCtcMin < bandMin) {
    return {
      ok: false,
      error: `Budget minimum is below the selected band floor (${bandMin}) for level ${roleLevel}`,
    };
  }
  if (params.budgetCtcMax != null && params.budgetCtcMax > bandMax) {
    return {
      ok: false,
      error: `Budget maximum exceeds the selected band ceiling (${bandMax}) for level ${roleLevel}`,
    };
  }

  return { ok: true };
}
