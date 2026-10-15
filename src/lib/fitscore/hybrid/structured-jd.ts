import { z } from "zod";

export const structuredRequirementTierSchema = z.enum([
  "must_have",
  "need_to_have",
  "nice_to_have",
]);

export const structuredJdSchema = z.object({
  role_basics: z
    .object({
      title: z.string().optional(),
      location: z.string().optional(),
      ctc_band: z.string().optional(),
      employment_type: z.string().optional(),
    })
    .default({}),
  responsibilities: z.array(z.string()).default([]),
  must_haves: z.array(z.string()).default([]),
  need_to_haves: z.array(z.string()).default([]),
  nice_to_haves: z.array(z.string()).default([]),
  version: z.number().int().positive().optional(),
});

export type StructuredJd = z.infer<typeof structuredJdSchema>;

export function parseStructuredJd(raw: unknown): StructuredJd | null {
  const parsed = structuredJdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
