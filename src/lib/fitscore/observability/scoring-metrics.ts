import { logger } from "@/lib/observability/logger";

export function recordRubricSelectedMetric(input: {
  rubricId: string;
  role: string;
  fallbackUsed: boolean;
}): void {
  logger.info("metric.scoring.rubric_selected", {
    rubric_id: input.rubricId,
    role: input.role,
    fallback_used: input.fallbackUsed,
  });
}

export function recordDimensionsJsonPopulatedMetric(input: {
  candidateId: string;
  dimCount: number;
}): void {
  logger.info("metric.scoring.dimensions_json_populated", {
    candidate_id: input.candidateId,
    dim_count: input.dimCount,
  });
}

export function recordScoringPathMetric(path: "hybrid" | "three_stage"): void {
  logger.info("metric.scoring.path_used", { path });
}
