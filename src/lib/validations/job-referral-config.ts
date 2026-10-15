import { z } from "zod";

export const jobReferralConfigBodySchema = z.object({
  enabled: z.boolean(),
  direct_bonus_amount: z.number().min(0).max(99999999),
  parent_bonus_amount: z.number().min(0).max(99999999),
  candidate_referrer_bonus_amount: z.number().min(0).max(99999999),
  vouch_bonus_amount: z.number().min(0).max(99999999),
  bonus_trigger: z.enum(["shortlisted", "offer_accepted", "day_90"]),
  candidate_referrer_enabled: z.boolean(),
  bonus_notes: z.string().max(2000).optional().nullable(),
});

export type JobReferralConfigBody = z.infer<typeof jobReferralConfigBodySchema>;
