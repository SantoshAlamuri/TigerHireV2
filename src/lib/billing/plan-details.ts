/**
 * Company plans: names, prices and what each includes. Shared by the billing
 * page and the work-driven Setup so the two always show the same plans.
 */
import { PLAN_SCORE_LABELS } from "@/lib/brand";

export const PLAN_ORDER = ["free", "starter", "growth", "scale", "enterprise"] as const;

export const PLAN_DETAILS: Record<
  string,
  { label: string; price: string; features: string[]; highlight?: boolean }
> = {
  free: {
    label: "Free",
    price: "₹0/mo",
    features: ["5 unlocks/month", "2 active jobs", PLAN_SCORE_LABELS.free],
  },
  starter: {
    label: "Starter",
    price: "₹9,999/mo",
    features: ["25 unlocks/month", "5 active jobs", PLAN_SCORE_LABELS.starter, "Email support"],
  },
  growth: {
    label: "Growth",
    price: "₹49,999/mo",
    highlight: true,
    features: [
      "100 unlocks/month",
      "15 active jobs",
      PLAN_SCORE_LABELS.growth,
      "Priority support",
      "Team seats (5)",
    ],
  },
  scale: {
    label: "Scale",
    price: "₹1,49,999/mo",
    features: [
      "500 unlocks/month",
      "Unlimited jobs",
      PLAN_SCORE_LABELS.scale,
      "Dedicated CSM",
      "Team seats (15)",
      "API access",
    ],
  },
  enterprise: {
    label: "Enterprise",
    price: "Custom",
    features: [
      "Unlimited unlocks",
      "Unlimited jobs",
      PLAN_SCORE_LABELS.enterprise,
      "24/7 support",
      "Unlimited seats",
      "SSO & SAML",
    ],
  },
};
