import { pilotJobId } from "./pilot-env";

/** Default Finstack QA job used across pilot / phase0 smokes. */
export const DEFAULT_PILOT_JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";

export function getPilotJobId(): string {
  return pilotJobId() ?? DEFAULT_PILOT_JOB_ID;
}

export function pilotJobUrl(suffix = ""): string {
  const id = getPilotJobId();
  const path = `/recruit/jobs/${id}${suffix}`;
  return path;
}

export function shouldSkipRequisitionCreation(): boolean {
  const flag = process.env.PILOT_SKIP_REQUISITION?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return Boolean(pilotJobId());
}
