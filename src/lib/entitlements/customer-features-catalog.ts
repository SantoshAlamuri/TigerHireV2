import type { EntitlementFeatureKey } from "@/lib/entitlements/config";

/** Plan-level features (Stripe / billing_plans) — names and billing hints for UI and docs. */
export interface EntitlementCustomerCatalogEntry {
  displayName: string;
  description: string;
  /** How this feature is typically sold. */
  commercialModel: "plan_included_or_addon" | "usage_overage_common" | "enterprise_only";
}

export const ENTITLEMENT_CUSTOMER_CATALOG: Record<
  EntitlementFeatureKey,
  EntitlementCustomerCatalogEntry
> = {
  agents_run: {
    displayName: "Agent runs",
    description: "WhatsApp and pipeline agents (scout, vouch, verify, scheduler).",
    commercialModel: "usage_overage_common",
  },
  fitscore_batch: {
    displayName: "FitScore batch",
    description: "Batch rescoring and high-volume FitScore operations.",
    commercialModel: "usage_overage_common",
  },
  assessments: {
    displayName: "Assessments",
    description: "Create, share, and score candidate assessments.",
    commercialModel: "plan_included_or_addon",
  },
  offers: {
    displayName: "Offers",
    description: "Offer letters and candidate offer flows.",
    commercialModel: "plan_included_or_addon",
  },
  compensation_bands: {
    displayName: "Compensation bands",
    description: "Internal compensation intelligence and bands.",
    commercialModel: "enterprise_only",
  },
  interview_prep: {
    displayName: "Interview prep",
    description: "Interview briefs, prep surfaces, and related hiring workflow.",
    commercialModel: "plan_included_or_addon",
  },
  scim: {
    displayName: "SCIM provisioning",
    description: "Directory sync and SCIM user provisioning.",
    commercialModel: "enterprise_only",
  },
};

export function getEntitlementCustomerCatalogEntry(
  key: EntitlementFeatureKey,
): EntitlementCustomerCatalogEntry {
  return ENTITLEMENT_CUSTOMER_CATALOG[key];
}
