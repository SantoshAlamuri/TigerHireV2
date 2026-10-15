import { logger } from "@/lib/observability/logger";
import { enqueue } from "@/lib/jobs/queue";

export type OutboundFanoutEventType =
  | "application.submitted"
  | "offer.candidate_responded"
  | "offer.signed";

/**
 * Queue delivery to all enabled org webhooks that subscribe to `eventType`
 * (event_types contains '*' or this event). Non-blocking: safe to void.
 */
export function triggerOrganisationOutboundEvent(input: {
  organisationId: string;
  eventType: OutboundFanoutEventType;
  data: Record<string, unknown>;
}): void {
  void enqueue("webhook-process", {
    type: "fanout",
    organisationId: input.organisationId,
    eventType: input.eventType,
    data: input.data,
  })
    .then((r) => {
      if (!r?.id) {
        logger.info("Organisation outbound event skipped (queue no-op)", {
          eventType: input.eventType,
          organisationId: input.organisationId,
        });
      }
    })
    .catch((err) => {
      logger.warn("Failed to enqueue organisation outbound event", {
        eventType: input.eventType,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
