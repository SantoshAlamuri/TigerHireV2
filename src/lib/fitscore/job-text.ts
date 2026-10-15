/**
 * Build JD text for three-stage FitScore from job record.
 * Used by FitScoreService to build ScoreInput.jd_text.
 */

export interface JobForJdText {
  title: string;
  description: string;
  location?: string | null;
  compensation_min?: number | null;
  compensation_max?: number | null;
  skills_required?: string[] | null;
  /** Optional — used for cost attribution when this job triggers vision fallback. */
  organisation_id?: string | null;
}

export function buildJdText(job: JobForJdText): string {
  let text = `Title: ${job.title}\n`;
  text += `Location: ${job.location ?? "Not specified"}\n`;
  const compMin = job.compensation_min;
  const compMax = job.compensation_max;
  if (compMin != null || compMax != null) {
    text += `Compensation: ${compMin != null ? `₹${(compMin / 100_000).toFixed(1)}L` : "?"} – ${compMax != null ? `₹${(compMax / 100_000).toFixed(1)}L` : "?"}\n`;
  }
  text += `\nDescription:\n${job.description}`;
  const skillsRequired = job.skills_required;
  if ((skillsRequired?.length ?? 0) > 0) {
    text += `\n\nRequired skills: ${(skillsRequired ?? []).join(", ")}`;
  }
  return text.trim();
}
