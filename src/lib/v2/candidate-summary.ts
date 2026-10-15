/**
 * The one-line summary under a candidate's name.
 *
 * A row showing only a name and a status is a placeholder, not information.
 * This assembles what the product already stores — experience, location,
 * notice, expected CTC, competing offers, skills, age of the application —
 * and omits anything unknown rather than printing filler.
 */
export interface SummaryInput {
  experienceYears?: number | null;
  location?: string | null;
  noticePeriodDays?: number | null;
  expectedCtcLpa?: number | null;
  offersInHand?: number | null;
  skills?: (string | null | undefined)[] | null;
  appliedAt?: string | null;
}

export interface CandidateSummary {
  parts: string[];
  skills: string[];
  moreSkills: number;
}

const MAX_SKILLS = 3;

function ageLabel(iso: string, now: number): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function buildCandidateSummary(
  input: SummaryInput,
  now: number = Date.now(),
): CandidateSummary {
  const parts: string[] = [];

  // Experience first — it is what a recruiter's eye goes to.
  if (typeof input.experienceYears === "number" && input.experienceYears > 0) {
    const y = input.experienceYears;
    const shown = Number.isInteger(y) ? String(y) : y.toFixed(1);
    parts.push(`${shown} ${y === 1 ? "yr" : "yrs"}`);
  }

  const location = input.location?.trim();
  if (location) parts.push(location);

  // Notice decides who can actually start, so it earns a slot.
  if (typeof input.noticePeriodDays === "number" && input.noticePeriodDays >= 0) {
    parts.push(input.noticePeriodDays === 0 ? "immediate" : `${input.noticePeriodDays}d notice`);
  }

  if (typeof input.expectedCtcLpa === "number" && input.expectedCtcLpa > 0) {
    parts.push(`₹${input.expectedCtcLpa}L expected`);
  }

  // Competing offers are a timing risk in a market where most candidates take
  // the first offer they receive.
  if (typeof input.offersInHand === "number" && input.offersInHand > 0) {
    parts.push(`${input.offersInHand} offer${input.offersInHand === 1 ? "" : "s"} in hand`);
  }

  if (input.appliedAt) {
    const age = ageLabel(input.appliedAt, now);
    if (age) parts.push(age);
  }

  const allSkills = (input.skills ?? []).map((s) => (s ?? "").trim()).filter((s) => s.length > 0);

  return {
    parts,
    skills: allSkills.slice(0, MAX_SKILLS),
    moreSkills: Math.max(0, allSkills.length - MAX_SKILLS),
  };
}

/**
 * What to show where a score would go.
 *
 * A bare dash reads as "nothing here". Saying why the score is missing is
 * actionable, and the usual cause is a job whose rubric was never approved —
 * the silent failure this product has shipped before.
 */
export function scoreLabel(
  score: number | null | undefined,
  rubricApproved: boolean,
): { text: string; muted: boolean } {
  if (typeof score === "number" && score > 0) return { text: String(score), muted: false };
  return rubricApproved
    ? { text: "not scored yet", muted: true }
    : { text: "no rubric approved", muted: true };
}
