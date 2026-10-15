import type { SupabaseClient } from "@supabase/supabase-js";
import { appendPlanHistory } from "./repository";

export type PlanSystemEventType =
  | "candidate_stage_moved"
  | "comms_sent"
  | "slot_picker_triggered"
  | "slot_booked"
  | "assessment_sent"
  | "exception_detected"
  | "nudge_sent"
  | "rescore_completed";

export async function logPlanSystemEvent(
  admin: SupabaseClient,
  params: {
    planId: string;
    candidateId?: string | null;
    eventType: PlanSystemEventType;
    description: string;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await appendPlanHistory(admin, {
    plan_id: params.planId,
    candidate_id: params.candidateId ?? null,
    actor_type: "system",
    event_type: params.eventType,
    event_summary: params.description,
    details: params.details ?? null,
  });
  if (error) {
    const { logger } = await import("@/lib/observability/logger");
    logger.warn("plan_history system log failed", {
      planId: params.planId,
      eventType: params.eventType,
      error: error.message,
    });
  }
}
