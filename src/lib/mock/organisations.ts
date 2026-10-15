import type { Organisation } from "@/types";

export const mockOrganisations: Organisation[] = [
  {
    id: "org-1",
    name: "FinStack Technologies",
    billingTier: "growth",
    unlockQuotaMonthly: 100,
    unlocksUsedThisMonth: 34,
    seatsUsed: 3,
    seatsTotal: 5,
    stripeCustomerId: "cus_finstack_001",
    createdAt: "2025-08-15T00:00:00Z",
  },
  {
    id: "org-2",
    name: "CloudKart",
    billingTier: "starter",
    unlockQuotaMonthly: 25,
    unlocksUsedThisMonth: 11,
    seatsUsed: 2,
    seatsTotal: 2,
    stripeCustomerId: "cus_cloudkart_001",
    createdAt: "2025-10-01T00:00:00Z",
  },
  {
    id: "org-3",
    name: "TalentBridge RPO",
    billingTier: "scale",
    unlockQuotaMonthly: 500,
    unlocksUsedThisMonth: 187,
    seatsUsed: 8,
    seatsTotal: 15,
    stripeCustomerId: "cus_talentbridge_001",
    createdAt: "2025-07-20T00:00:00Z",
  },
];
