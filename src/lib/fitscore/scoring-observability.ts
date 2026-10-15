/**
 * Persist FitScore guard/retry/skip events for daily cost dashboards (platform_cost_events).
 */

import { randomUUID } from "node:crypto";
import { recordPlatformCostEvent } from "@/lib/costs/ledger";

export type FitScoreObservabilityEventType =
  | "fitscore_dedupe_skip"
  | "fitscore_concurrent_skip"
  | "fitscore_extraction_retry"
  | "fitscore_extraction_validation_failed"
  | "fitscore_deterministic_fallback"
  | "fitscore_empty_dimension_scores"
  | "resume_processing_tier"
  | "vision_fallback_skipped";

/** Fire-and-forget observability row (amount_usd = 0). */
export function recordFitScoreObservabilityEvent(params: {
  eventType: FitScoreObservabilityEventType;
  jobId?: string;
  candidateId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}): void {
  const day = (params.occurredAt ?? new Date().toISOString()).slice(0, 10);
  const jobSeg = params.jobId?.slice(0, 8) ?? "na";
  const candSeg = params.candidateId?.slice(0, 8) ?? "na";
  const externalId = `tigerhire:fitscore_obs:${params.eventType}:${day}:${jobSeg}:${candSeg}:${randomUUID()}`;

  void recordPlatformCostEvent({
    provider: "tigerhire",
    service: "fitscore_scoring",
    category: "observability",
    amountUsd: 0,
    quantity: 1,
    unit: "event",
    externalId,
    jobId: params.jobId,
    candidateId: params.candidateId,
    occurredAt: params.occurredAt,
    metadata: {
      type: params.eventType,
      ...params.metadata,
    },
  });
}
