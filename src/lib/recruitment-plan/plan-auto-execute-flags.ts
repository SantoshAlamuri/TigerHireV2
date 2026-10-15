import { env } from "@/lib/config/env";

/** Brief 11 Phase C: both plan document and auto-execute flags must be on. */
export function isPlanAutoExecuteEnabled(): boolean {
  return env.ffPlanAutoExecute;
}
