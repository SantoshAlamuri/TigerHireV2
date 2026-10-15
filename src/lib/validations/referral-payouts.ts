import { z } from "zod";

export const confirmPayoutsBodySchema = z.object({
  ledger_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const generatePayoutRunBodySchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

/**
 * The operator's proof that money actually left an account. Required, and not
 * blank-able: a run marked paid with no reference is indistinguishable from one
 * marked paid by accident, and this is the field the company's finance team
 * reconciles the statement against.
 */
export const markPayoutRunPaidBodySchema = z.object({
  payment_reference: z.string().trim().min(3).max(200),
});

export type ConfirmPayoutsBody = z.infer<typeof confirmPayoutsBodySchema>;
export type GeneratePayoutRunBody = z.infer<typeof generatePayoutRunBodySchema>;
export type MarkPayoutRunPaidBody = z.infer<typeof markPayoutRunPaidBodySchema>;
