/**
 * Reusing an approved rubric from another job.
 *
 * Rubrics are keyed per job (`jd_base_documents.job_id`), so twelve open roles
 * means twelve bars built from scratch, and there is no way to say "all our
 * backend roles use this one". A genuine shared library needs a schema change.
 * Reuse does not: an already-approved rubric on another job is a legitimate
 * starting point, and copying it is what turns twelve calibration
 * conversations into one.
 *
 * Only approved, non-empty rubrics qualify — an unapproved or empty bar is a
 * worse starting point than nothing, because it looks like a decision that was
 * never actually made.
 */
export interface RubricSource {
  jobId: string;
  jobTitle: string;
  approvedBy: string | null;
  approvedAt: string | null;
  mustHaveCount: number;
}

export interface ReusableRubric extends RubricSource {
  /** The role titles share a meaningful word, so this is a likely fit. */
  similar: boolean;
}

/**
 * Words that appear in half the job titles in any company and therefore carry
 * no signal about whether two roles share a bar.
 */
const NOISE = new Set([
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "associate",
  "engineer",
  "developer",
  "manager",
  "specialist",
  "executive",
  "i",
  "ii",
  "iii",
  "sr",
  "jr",
]);

function meaningfulWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !NOISE.has(w)),
  );
}

function isSimilar(a: string, b: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const wa = meaningfulWords(a);
  const wb = meaningfulWords(b);
  for (const w of wa) if (wb.has(w)) return true;
  return false;
}

export function reusableRubrics(
  currentJobId: string,
  currentTitle: string,
  sources: RubricSource[],
): ReusableRubric[] {
  return sources
    .filter((s) => s.jobId !== currentJobId && Boolean(s.approvedBy?.trim()) && s.mustHaveCount > 0)
    .map((s) => ({ ...s, similar: isSimilar(currentTitle, s.jobTitle) }))
    .sort((x, y) => {
      // Similar roles first; within each group, the freshest approval wins,
      // because a stale bar is a poor template.
      if (x.similar !== y.similar) return x.similar ? -1 : 1;
      const tx = x.approvedAt ? Date.parse(x.approvedAt) : 0;
      const ty = y.approvedAt ? Date.parse(y.approvedAt) : 0;
      return (Number.isNaN(ty) ? 0 : ty) - (Number.isNaN(tx) ? 0 : tx);
    });
}
