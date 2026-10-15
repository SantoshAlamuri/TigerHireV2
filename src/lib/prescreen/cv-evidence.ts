/** CV keyword evidence for must-have requirements (no LLM). Extracted from gate.ts. */

/** True when the resume plausibly mentions a requirement (token overlap heuristic). */
export function resumeMentionsRequirement(resumeText: string, requirementText: string): boolean {
  const resume = resumeText.toLowerCase();
  const tokens = requirementText
    .toLowerCase()
    .split(/[\s,/|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 3);
  if (tokens.length === 0) return true;
  const hits = tokens.filter((t) => resume.includes(t)).length;
  return hits >= Math.min(2, tokens.length);
}

/** Return the must-have labels with no CV evidence. */
export function missingCvEvidence(resumeText: string, mustHaves: { text: string }[]): string[] {
  return mustHaves
    .filter((req) => !resumeMentionsRequirement(resumeText, req.text))
    .map((req) => req.text);
}
