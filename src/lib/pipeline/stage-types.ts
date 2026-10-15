import { z } from "zod";

export const PIPELINE_STAGE_TYPES = [
  "system_auto",
  "screening",
  "interview",
  "assessment",
  "offer",
  "terminal_hired",
  "terminal_reject",
] as const;

export type PipelineStageType = (typeof PIPELINE_STAGE_TYPES)[number];

export const pipelineStageTypeSchema = z.enum(PIPELINE_STAGE_TYPES);

export const LOCKED_SYSTEM_STAGE_NAMES = ["Applied", "FitScore Review"] as const;

export function isLockedSystemStageName(name: string): boolean {
  return (LOCKED_SYSTEM_STAGE_NAMES as readonly string[]).includes(name.trim());
}
