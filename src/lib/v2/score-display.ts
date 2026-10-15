/**
 * One number, one source of truth.
 *
 * `fit_scores.one_line_summary` embeds the score as text at scoring time. A row
 * on preview stores `overall_score = 53` while its summary opens with
 * "FitScore 56 (Moderate Fit)" — the prose was written before calibration was
 * applied and is now frozen in the database. Today's pipeline passes the
 * calibrated score into that string, so new rows agree, but every historical
 * row will contradict itself forever.
 *
 * v2 therefore renders the stored score and strips the embedded claim from the
 * narrative, rather than letting two numbers argue on screen. Where they
 * disagree the drift is reported, not hidden — a recruiter who saw "56"
 * yesterday deserves to know why it says 53 today.
 */
const EMBEDDED_SCORE = /^\s*FitScore\s+(\d{1,3})\s*(?:\([^)]*\))?\s*[;:.]?\s*/i;

export function stripEmbeddedScore(text: string | null | undefined): string {
  if (!text) return "";
  const stripped = text.replace(EMBEDDED_SCORE, "");
  if (stripped === text) return text;
  // The sentence began mid-clause once the claim was removed; restore a lead.
  return stripped.replace(/^verdict:/i, "Verdict:");
}

export function extractEmbeddedScore(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(EMBEDDED_SCORE);
  return m ? Number(m[1]) : null;
}

export interface Band {
  label: string;
  tone: "strong" | "good" | "moderate" | "weak" | "none";
}

/**
 * Fallback banding from the score alone, using default cutoffs. Only used when
 * no persisted band is available (older rows). Prefer the persisted band, which
 * was computed with the JD's OWN thresholds — see bandFromPersistedLabel.
 */
export function bandFor(score: number | null | undefined): Band {
  if (typeof score !== "number" || score <= 0) return { label: "Not scored", tone: "none" };
  if (score >= 90) return { label: "Strong fit", tone: "strong" };
  if (score >= 75) return { label: "Good fit", tone: "good" };
  if (score >= 60) return { label: "Moderate fit", tone: "moderate" };
  return { label: "Below bar", tone: "weak" };
}

/**
 * Map a persisted fit label (produced by fitLabelForScore with the JD's own
 * thresholds — "Strong Fit" / "Good Fit" / "Moderate Fit" / "Weak Fit" /
 * "Not a Fit") to a display Band, so the chip agrees with the verdict instead of
 * using hardcoded 90/75/60 cutoffs. Returns null for an unrecognised label so the
 * caller can fall back to bandFor. (#350)
 */
export function bandFromPersistedLabel(label: string | null | undefined): Band | null {
  const l = (label ?? "").trim().toLowerCase();
  if (!l) return null;
  if (l.includes("strong")) return { label: "Strong fit", tone: "strong" };
  if (l.includes("good")) return { label: "Good fit", tone: "good" };
  if (l.includes("moderate")) return { label: "Moderate fit", tone: "moderate" };
  if (l.includes("weak")) return { label: "Weak fit", tone: "weak" };
  if (l.includes("not a fit") || l.includes("no fit") || l === "not fit")
    return { label: "Not a fit", tone: "weak" };
  return null;
}

export interface ScoreDisplay {
  score: number | null;
  band: Band;
  narrative: string;
  /** The number the stored prose claimed, when it disagreed with the score. */
  staleNarrativeScore: number | null;
}

export function scoreDisplay(
  score: number | null | undefined,
  narrative: string | null | undefined,
  /** Persisted band label (JD-threshold-derived). Preferred over score cutoffs so the chip agrees with the verdict. (#350) */
  persistedBand?: string | null,
): ScoreDisplay {
  const embedded = extractEmbeddedScore(narrative);
  const resolved = typeof score === "number" && score > 0 ? score : null;
  // Prefer the persisted band (computed with the JD's own thresholds); fall back
  // to default cutoffs only when there is no persisted label (older rows).
  const band = (resolved !== null && bandFromPersistedLabel(persistedBand)) || bandFor(resolved);
  return {
    score: resolved,
    band,
    narrative: stripEmbeddedScore(narrative),
    staleNarrativeScore: embedded !== null && embedded !== resolved ? embedded : null,
  };
}
