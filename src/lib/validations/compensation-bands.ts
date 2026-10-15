import { z } from "zod";

export const createCompensationBandSchema = z.object({
  label: z.string().min(1).max(200),
  currency: z
    .string()
    .min(3)
    .max(3)
    .transform((s) => s.toUpperCase()),
  minAmount: z.number().finite(),
  maxAmount: z.number().finite(),
});

export const patchCompensationBandSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  currency: z.string().min(3).max(3).optional(),
  minAmount: z.number().finite().optional(),
  maxAmount: z.number().finite().optional(),
  isActive: z.boolean().optional(),
});
