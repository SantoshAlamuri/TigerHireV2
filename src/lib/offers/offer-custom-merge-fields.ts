import { z } from "zod";

/** True when PostgREST/Postgres rejects `custom_merge_field_defs` (migration not applied yet). */
export function isMissingOfferTemplateCustomMergeColumn(
  error: { message?: string; code?: string; details?: string } | null,
): boolean {
  if (!error) return false;
  const msg = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (msg.includes("custom_merge_field_defs")) return true;
  if (msg.includes("column") && msg.includes("does not exist")) return true;
  if (error.code === "42703") return true;
  return false;
}

/** Built-in template variables — custom keys must not collide with these. */
export const RESERVED_OFFER_TEMPLATE_VAR_KEYS = new Set([
  "company_name",
  "candidate_name",
  "role_title",
  "start_date",
  "compensation",
  "compensation_breakdown",
  "ctc_lpa",
  "notes",
  "generated_date",
]);

export type OfferCustomMergeFieldDef = {
  key: string;
  label: string;
  description?: string;
};

export const offerCustomMergeFieldDefSchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{0,62}$/,
      "Use snake_case: start with a letter, then letters, digits, or underscores.",
    ),
  label: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
});

export const offerCustomMergeFieldDefsSchema = z.array(offerCustomMergeFieldDefSchema).max(40);

export function parseCustomMergeFieldDefs(raw: unknown): OfferCustomMergeFieldDef[] {
  const parsed = offerCustomMergeFieldDefsSchema.safeParse(raw);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: OfferCustomMergeFieldDef[] = [];
  for (const row of parsed.data) {
    if (RESERVED_OFFER_TEMPLATE_VAR_KEYS.has(row.key)) continue;
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    out.push({
      key: row.key,
      label: row.label.trim(),
      ...(row.description?.trim() ? { description: row.description.trim() } : {}),
    });
  }
  return out;
}

/** Values for custom keys only; keys must be allowed by defs. */
export function letterVariablesForTemplate(
  defs: OfferCustomMergeFieldDef[],
  raw: unknown,
): Record<string, string> {
  const allowed = new Set(defs.map((d) => d.key));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) continue;
    if (typeof v === "string") {
      out[k] = v.slice(0, 4000);
    } else if (v === null || v === undefined) {
      out[k] = "";
    } else {
      out[k] = String(v).slice(0, 4000);
    }
  }
  return out;
}

/** One string per defined custom key (missing → empty). */
export function resolvedCustomMergeValues(
  defs: OfferCustomMergeFieldDef[],
  raw: unknown,
): Record<string, string> {
  const partial = letterVariablesForTemplate(defs, raw);
  const out: Record<string, string> = {};
  for (const d of defs) {
    out[d.key] = partial[d.key] ?? "";
  }
  return out;
}
