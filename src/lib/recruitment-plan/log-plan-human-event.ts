import type { SupabaseClient } from "@supabase/supabase-js";
import { appendPlanHistory } from "./repository";

export type PlanHumanEventType =
  | "pipeline_stage_moved"
  | "shortlist_decision"
  | "requisition_decision"
  | "offer_finance_decision";

/**
 * Records a human decision or pipeline move in plan_history for compliance visibility.
 */
export async function logPlanHumanEvent(
  admin: SupabaseClient,
  params: {
    planId: string;
    candidateId?: string | null;
    actorUserId: string;
    eventType: PlanHumanEventType;
    description: string;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await appendPlanHistory(admin, {
    plan_id: params.planId,
    candidate_id: params.candidateId ?? null,
    actor_type: "human",
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    event_summary: params.description,
    details: params.details ?? null,
  });
  if (error) {
    const { logger } = await import("@/lib/observability/logger");
    logger.warn("plan_history human log failed", {
      planId: params.planId,
      eventType: params.eventType,
      error: error.message,
    });
  }
}
