import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type ApplicationAnalyticsEvent = "applied" | "withdrawn" | "status_change";

/**
 * Forward-looking hook for application analytics. No dedicated events table yet (A4 slice):
 * emits structured logs tagged `application_event` for observability; `supabase` reserved for a future insert.
 */
export function logApplicationEvent(
  _supabase: SupabaseClient,
  params: {
    applicationId: string;
    jobId: string;
    candidateId: string;
    orgId: string;
    event: ApplicationAnalyticsEvent;
    metadata?: Record<string, unknown>;
  },
): void {
  logger.info("application_event", {
    tag: "application_event",
    applicationId: params.applicationId,
    jobId: params.jobId,
    candidateId: params.candidateId,
    orgId: params.orgId,
    event: params.event,
    metadata: params.metadata ?? null,
  });
}
