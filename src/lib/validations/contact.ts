import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(200),
  email: z.string().email("Please enter a valid email"),
  company: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(1, "Please enter a message").max(5000),
  type: z.enum(["company", "candidate", "press", "partner", "other"]).default("other"),
});

export type ContactInput = z.infer<typeof contactSchema>;
