import type { PlanStageType } from "./types";

/**
 * Map pipeline stage name / type to plan stage_type for backfill and defaults.
 */
export function inferPlanStageType(input: {
  stageName: string;
  pipelineStageType?: string | null;
}): PlanStageType {
  const name = input.stageName.trim().toLowerCase();
  const pType = String(input.pipelineStageType ?? "").toLowerCase();

  if (name === "applied" || name.includes("application")) return "application_review";
  if (name.includes("fitscore") || name.includes("review")) return "application_review";
  if (name.includes("phone") || name.includes("screen")) return "phone_screen";
  if (name.includes("offer")) return "offer";
  if (name.includes("approval") || name.includes("approve")) return "approval";
  if (pType === "assessment" || name.includes("assessment") || name.includes("take-home")) {
    return "assessment";
  }
  if (
    pType === "interview" ||
    name.includes("interview") ||
    name.includes("technical") ||
    name.includes("hm round") ||
    name.includes("hiring manager")
  ) {
    return "interview";
  }
  if (pType === "offer") return "offer";
  if (pType === "screening") return "phone_screen";

  return "custom";
}
