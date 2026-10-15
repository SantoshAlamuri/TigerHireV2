import { z } from "zod";

export const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  type: z.enum(["company", "candidate"]).default("candidate"),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;
