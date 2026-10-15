import { Inngest } from "inngest";
import { getInngestCredentials } from "./credentials";

/**
 * Inngest client for background jobs. Configure INNGEST_EVENT_KEY in production
 * (from Inngest Cloud or self-hosted) so enqueue() sends events. When unset, queue.ts no-ops.
 */
export const inngest = new Inngest({
  id: "tigerhire",
  ...getInngestCredentials(),
});
