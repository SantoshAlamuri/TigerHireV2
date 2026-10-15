/**
 * The hiring manager's interview screens: the scorecard and the brief.
 *
 * Two rules drive everything here.
 *
 * First, a scorecard's criteria come from the SAME approved rubric candidates
 * were screened against. If the interview measures a different bar than the
 * screen did, Quality-of-Hire cannot be analysed and the rubric's authority
 * quietly evaporates.
 *
 * Second, compensation never reaches the panel. It is the recruiter's to
 * negotiate, and an interviewer who knows the number judges differently. That
 * is enforced here rather than left to whoever writes the UI.
 */

/** Anchors so a "3" means the same thing to two different interviewers. */
export interface Criterion {
  id: string;
  name: string;
  high: string;
  low: string;
  /** True when it came from the job's rubric rather than the default set. */
  fromRubric: boolean;
}

const COMMUNICATION: Criterion = {
  id: "communication",
  name: "Communication",
  high: "Crisp, structured, honest about gaps",
  low: "Vague or evasive",
  fromRubric: false,
};

const DEFAULTS: Criterion[] = [
  {
    id: "depth",
    name: "Technical depth",
    high: "Designed and operated it at scale",
    low: "Conceptual familiarity only",
    fromRubric: false,
  },
  {
    id: "ownership",
    name: "Ownership & incident maturity",
    high: "Ran postmortems, owned SLOs",
    low: "Escalated everything",
    fromRubric: false,
  },
];

/** A form nobody can finish is worse than a shorter one that gets filled. */
const MAX_CRITERIA = 6;

export function buildScorecard(mustHaves: (string | null | undefined)[]): Criterion[] {
  const fromRubric: Criterion[] = mustHaves
    .map((m) => (m ?? "").trim())
    .filter((m) => m.length > 0)
    .map((name, i) => ({
      id: `rubric-${i}`,
      name,
      high: "Demonstrated with specifics and scale",
      low: "Claimed but not evidenced",
      fromRubric: true,
    }));

  const base = fromRubric.length > 0 ? fromRubric : DEFAULTS;
  // Communication is judged by every panel and listed by no rubric.
  return [...base, COMMUNICATION].slice(0, MAX_CRITERIA);
}

export interface VerdictCheck {
  allowed: boolean;
  reason: string;
}

/**
 * A verdict without a complete scorecard is an opinion, not a decision — and it
 * is the pattern that makes hiring data useless six months later.
 */
export function canSubmitVerdict(
  ratings: Record<string, number>,
  criteriaCount: number,
): VerdictCheck {
  if (criteriaCount <= 0) return { allowed: false, reason: "No criteria to rate." };
  const rated = Object.values(ratings).filter((v) => typeof v === "number" && v > 0).length;
  if (rated >= criteriaCount) return { allowed: true, reason: "" };
  return {
    allowed: false,
    reason: `Rate all criteria first — ${rated} of ${criteriaCount} done.`,
  };
}

export const OFF_LIMITS = {
  compensation: "Compensation — the recruiter owns this. Knowing the number biases the round.",
} as const;

export interface BriefInput {
  evidenceQuotes: { quote: string; source: string }[];
  mustHaves: string[];
  amberFlags: string[];
}

export interface BriefLine {
  text: string;
  citation: string;
}

export interface Brief {
  evidenced: BriefLine[];
  probe: BriefLine[];
  offLimits: string[];
}

/** Anything that reads like pay must not reach the panel. */
const MONEY = /(₹|\bctc\b|\blpa\b|salary|compensation|\bpay\b)/i;

export function buildBrief(input: BriefInput): Brief {
  const evidenced: BriefLine[] = input.evidenceQuotes
    .filter((q) => q.quote?.trim() && !MONEY.test(q.quote))
    .map((q) => ({ text: q.quote.trim(), citation: q.source }));

  const evidencedText = evidenced.map((e) => e.text.toLowerCase()).join(" ");

  const probe: BriefLine[] = [];
  for (const m of input.mustHaves) {
    const need = (m ?? "").trim();
    if (!need || MONEY.test(need)) continue;
    const words = need
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const covered = words.some((w) => evidencedText.includes(w));
    if (!covered) {
      probe.push({ text: `${need} — claimed but not evidenced`, citation: "rubric must-have" });
    }
  }
  for (const f of input.amberFlags) {
    const flag = (f ?? "").trim();
    if (flag && !MONEY.test(flag)) probe.push({ text: flag, citation: "scoring flag" });
  }

  return { evidenced, probe, offLimits: [OFF_LIMITS.compensation] };
}
