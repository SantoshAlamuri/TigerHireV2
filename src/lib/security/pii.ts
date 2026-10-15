/**
 * Mask sensitive candidate fields before returning in shortlist / search APIs.
 * PII is only revealed after a recruiter unlocks the candidate (costs credits).
 */
export function maskCandidateForShortlist<T extends Record<string, unknown>>(
  candidate: T,
  isUnlocked: boolean,
): T {
  if (isUnlocked) return candidate;

  return {
    ...candidate,
    phone: null,
    email: null,
    full_name: maskName(candidate.full_name as string | null),
    cv_url: null,
    linkedin_url: null,
  };
}

function maskName(name: string | null | undefined): string {
  if (!name) return "Candidate";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0] + "•••";
  return parts[0] + " " + parts[parts.length - 1][0] + ".";
}
