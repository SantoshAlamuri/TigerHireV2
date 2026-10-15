import { ENTITLEMENT_FEATURE_KEYS } from "@/lib/entitlements/config";
import type { AdminPayload, OnboardingPlan } from "./types";

export const EMPTY_ADMIN_PAYLOAD: AdminPayload = {
  legalCompanyName: "",
  billingSpocName: "",
  billingSpocEmail: "",
  billingSpocPhone: "",
  billingAddress: "",
  gstin: "",
  website: "",
  notes: "",
  workflow: {
    companyInfoSaved: false,
    billingProfileSaved: false,
    creditsConfigured: false,
    overridesReviewed: false,
  },
};

export function recommendedMonthlyCredits(plan: OnboardingPlan) {
  if (plan === "enterprise") return { unlock: 500, job: 75 };
  if (plan === "pro") return { unlock: 200, job: 30 };
  return { unlock: 50, job: 8 };
}

export function recommendedOverridesForPlan(
  plan: OnboardingPlan,
): Array<{ featureKey: (typeof ENTITLEMENT_FEATURE_KEYS)[number]; enabled: boolean }> {
  if (plan === "starter") {
    return [
      { featureKey: "fitscore_batch", enabled: false },
      { featureKey: "scim", enabled: false },
    ];
  }
  if (plan === "pro") {
    return [{ featureKey: "scim", enabled: false }];
  }
  return [];
}
