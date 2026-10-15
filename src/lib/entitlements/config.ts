export const ENTITLEMENT_FEATURE_KEYS = [
  "agents_run",
  "fitscore_batch",
  "assessments",
  "offers",
  "compensation_bands",
  "interview_prep",
  "scim",
] as const;

export type EntitlementFeatureKey = (typeof ENTITLEMENT_FEATURE_KEYS)[number];

export const ENTITLEMENT_LABELS: Record<EntitlementFeatureKey, string> = {
  agents_run: "Agent runs",
  fitscore_batch: "FitScore batch",
  assessments: "Assessments",
  offers: "Offers",
  compensation_bands: "Compensation bands",
  interview_prep: "Interview prep",
  scim: "SCIM",
};

export const GLOBAL_KILL_SWITCH_BY_FEATURE: Record<EntitlementFeatureKey, string> = {
  agents_run: "agents_run_global",
  fitscore_batch: "fitscore_batch_global",
  assessments: "assessments_global",
  offers: "offers_global",
  compensation_bands: "compensation_bands_global",
  interview_prep: "interview_prep_global",
  scim: "scim_global",
};

export function isEntitlementFeatureKey(value: string): value is EntitlementFeatureKey {
  return (ENTITLEMENT_FEATURE_KEYS as readonly string[]).includes(value);
}
