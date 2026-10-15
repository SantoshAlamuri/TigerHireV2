/**
 * Derives per-job interview feedback form fields from the Ideal Candidate Profile (JD Base)
 * and keeps `feedback_form_templates` in sync whenever that profile is saved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isIdealCandidateProfile,
  type IdealCandidateProfile,
} from "@/lib/fitscore/hybrid/ideal-profile";

export const IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME = "Ideal profile interview feedback";

const LEGACY_DEFAULT_FEEDBACK_TEMPLATE_NAME = "Default Interview Feedback";

export type IdealProfileFeedbackField = {
  label: string;
  type: "rating" | "text" | "select" | "number";
  required?: boolean;
  description?: string;
};

function humanizeDimensionKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  if (!spaced) return key;
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build feedback `fields` JSON from an ideal candidate profile (rating + evidence prompts). */
export function buildFeedbackFieldsFromIdealProfile(
  profile: IdealCandidateProfile,
): IdealProfileFeedbackField[] {
  const fields: IdealProfileFeedbackField[] = [];
  const usedLabels = new Set<string>();

  function addField(field: Omit<IdealProfileFeedbackField, "label"> & { label: string }) {
    let label = field.label.trim() || "Criterion";
    let n = 2;
    while (usedLabels.has(label)) {
      label = `${field.label.trim()} (${n})`;
      n += 1;
    }
    usedLabels.add(label);
    fields.push({ ...field, label });
  }

  for (const [key, benchmark] of Object.entries(profile.benchmarks ?? {})) {
    const desc = typeof benchmark === "string" ? benchmark.trim() : "";
    if (!desc) continue;
    addField({
      label: humanizeDimensionKey(key),
      type: "rating",
      required: true,
      description: desc,
    });
  }

  for (const raw of profile.must_haves ?? []) {
    const item = typeof raw === "string" ? raw.trim() : "";
    if (!item) continue;
    addField({
      label: item.length > 100 ? `${item.slice(0, 97)}…` : item,
      type: "rating",
      required: true,
      description: "Must-have — rate strength of evidence from the interview (1 weak, 5 strong).",
    });
  }

  for (const raw of profile.nice_to_haves ?? []) {
    const item = typeof raw === "string" ? raw.trim() : "";
    if (!item) continue;
    addField({
      label: item.length > 100 ? `${item.slice(0, 97)}…` : item,
      type: "rating",
      required: false,
      description: "Nice-to-have — optional rating if discussed.",
    });
  }

  const years = typeof profile.years_range === "string" ? profile.years_range.trim() : "";
  if (years) {
    addField({
      label: "Experience vs role expectation",
      type: "rating",
      required: true,
      description: `Role targets ~${years}. Rate how well experience aligns.`,
    });
  }

  addField({
    label: "Strengths vs ideal profile",
    type: "text",
    required: false,
    description: profile.summary
      ? `Ideal summary (reference): ${profile.summary}`
      : "Where the candidate matches the ideal profile.",
  });

  addField({
    label: "Gaps or risks vs ideal profile",
    type: "text",
    required: false,
    description: "Misses on must-haves, benchmarks, or seniority.",
  });

  return fields;
}

/**
 * Upsert the job's primary feedback template from the ideal profile.
 * Reuses the legacy seeded "Default Interview Feedback" row when present so jobs do not keep two defaults.
 */
export async function syncFeedbackTemplateFromIdealProfile(
  supabase: SupabaseClient,
  jobId: string,
  profile: IdealCandidateProfile,
): Promise<void> {
  const fields = buildFeedbackFieldsFromIdealProfile(profile);
  const now = new Date().toISOString();

  const { data: idealRows, error: idealErr } = await supabase
    .from("feedback_form_templates")
    .select("id")
    .eq("job_id", jobId)
    .eq("name", IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME)
    .limit(1);

  if (idealErr) throw idealErr;

  const idealRow = idealRows?.[0] as { id: string } | undefined;

  if (idealRow?.id) {
    const { error } = await supabase
      .from("feedback_form_templates")
      .update({ fields, updated_at: now })
      .eq("id", idealRow.id);
    if (error) throw error;
    return;
  }

  const { data: legacyRows, error: legacyErr } = await supabase
    .from("feedback_form_templates")
    .select("id")
    .eq("job_id", jobId)
    .eq("name", LEGACY_DEFAULT_FEEDBACK_TEMPLATE_NAME)
    .limit(1);

  if (legacyErr) throw legacyErr;

  const legacyRow = legacyRows?.[0] as { id: string } | undefined;

  if (legacyRow?.id) {
    const { error } = await supabase
      .from("feedback_form_templates")
      .update({
        name: IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME,
        fields,
        updated_at: now,
      })
      .eq("id", legacyRow.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("feedback_form_templates").insert({
    job_id: jobId,
    name: IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME,
    fields,
    created_by: null,
  });
  if (error) throw error;
}

export async function maybeSyncFeedbackTemplateFromIdealProfile(
  supabase: SupabaseClient,
  jobId: string,
  profile: unknown,
): Promise<void> {
  if (!isIdealCandidateProfile(profile)) return;
  await syncFeedbackTemplateFromIdealProfile(supabase, jobId, profile);
}
