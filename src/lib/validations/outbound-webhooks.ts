import { z } from "zod";

const eventName = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9._*-]+$/i, "Event names use letters, numbers, dots, underscores, hyphen, *");

export const createOutboundWebhookSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  targetUrl: z.string().url("Valid HTTPS or HTTP URL required").max(2048),
  eventTypes: z.array(eventName).min(1).max(50).default(["*"]),
  isEnabled: z.boolean().optional().default(true),
});

export const patchOutboundWebhookSchema = z
  .object({
    name: z.string().max(200).optional().nullable(),
    targetUrl: z.string().url().max(2048).optional(),
    eventTypes: z.array(eventName).min(1).max(50).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict();

export type CreateOutboundWebhookInput = z.infer<typeof createOutboundWebhookSchema>;
export type PatchOutboundWebhookInput = z.infer<typeof patchOutboundWebhookSchema>;
