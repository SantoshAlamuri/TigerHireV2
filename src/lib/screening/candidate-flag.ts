export type CandidateScreeningFlag = "not_started" | "in_progress" | "completed" | "attention";

export function resolveCandidateScreeningFlag(
  status: string | null | undefined,
): CandidateScreeningFlag {
  if (!status) return "not_started";

  switch (status) {
    case "queued":
    case "awaiting_consent":
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "no_response":
    case "failed":
    case "cancelled":
    case "skipped":
      return "attention";
    default:
      return "not_started";
  }
}

export function screeningFlagLabel(flag: CandidateScreeningFlag): string {
  switch (flag) {
    case "in_progress":
      return "Screening In Progress";
    case "completed":
      return "Screening Completed";
    case "attention":
      return "Screening Needs Review";
    default:
      return "Screening Not Started";
  }
}
