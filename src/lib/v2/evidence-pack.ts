/**
 * Evidence pack — turns everything already stored about a candidate into three
 * columns a reviewer can scan: what argues FOR them, what needs VERIFYING in an
 * interview, and what argues AGAINST.
 *
 * Two rules are non-negotiable and are enforced here rather than in the UI:
 *
 *  1. Nothing is displayed that cannot be attributed. This codebase's own
 *     correctness conventions forbid showing unverified resume quotes, so an
 *     item with no source is dropped and counted, never rendered.
 *  2. Gaps are only claimed against things the rubric actually asked for. A
 *     must-have with no supporting evidence becomes a probe, not an accusation.
 */
export type Polarity = "positive" | "negative";
export type FlagTier = "green" | "amber" | "red";

export interface EvidenceReason {
  text: string;
  polarity: Polarity;
  /** Where the quote came from. Null means unattributed — it will be dropped. */
  source: "cv" | "screening" | null;
}

export interface EvidenceFlag {
  label: string;
  tier: FlagTier;
}

export interface ScreeningAnswer {
  question: string;
  answer: string;
}

export interface EvidenceInput {
  reasons: EvidenceReason[];
  flags: EvidenceFlag[];
  screeningAnswers: ScreeningAnswer[];
  rubricMustHaves: string[];
}

export type EvidenceKind = "quote" | "flag" | "screening-answer" | "unevidenced-must-have";

export interface EvidenceItem {
  quote: string;
  citation: string;
  kind: EvidenceKind;
}

export interface EvidencePack {
  for: EvidenceItem[];
  verify: EvidenceItem[];
  against: EvidenceItem[];
  counts: { for: number; verify: number; against: number };
  /** How many items were withheld because they had no attributable source. */
  droppedUnattributed: number;
  isEmpty: boolean;
}

const CITATION: Record<"cv" | "screening", string> = {
  cv: "CV",
  screening: "WhatsApp screening",
};

/** Same point from two sources should appear once. */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function pushUnique(list: EvidenceItem[], item: EvidenceItem): void {
  if (list.some((existing) => norm(existing.quote) === norm(item.quote))) return;
  list.push(item);
}

export function isDisplayableEvidence(value: string | null | undefined): value is string {
  return Boolean(value?.trim()) && value!.trim().toUpperCase() !== "NO_DEFENSIBLE_QUOTE";
}

export function buildEvidencePack(input: EvidenceInput): EvidencePack {
  const forCol: EvidenceItem[] = [];
  const verifyCol: EvidenceItem[] = [];
  const againstCol: EvidenceItem[] = [];
  let droppedUnattributed = 0;

  for (const reason of input.reasons) {
    const text = reason.text?.trim();
    if (!isDisplayableEvidence(text)) continue;
    if (!reason.source) {
      // Rule 1: no source, no display.
      droppedUnattributed++;
      continue;
    }
    const item: EvidenceItem = {
      quote: text,
      citation: CITATION[reason.source],
      kind: "quote",
    };
    pushUnique(reason.polarity === "positive" ? forCol : againstCol, item);
  }

  for (const flag of input.flags) {
    const label = flag.label?.trim();
    if (!isDisplayableEvidence(label)) continue;
    const item: EvidenceItem = { quote: label, citation: "Scoring flag", kind: "flag" };
    if (flag.tier === "green") pushUnique(forCol, item);
    else if (flag.tier === "amber") pushUnique(verifyCol, item);
    else pushUnique(againstCol, item);
  }

  for (const qa of input.screeningAnswers) {
    const answer = qa.answer?.trim();
    if (!answer) continue;
    pushUnique(forCol, {
      quote: answer,
      citation: `WhatsApp screening — ${qa.question.trim()}`,
      kind: "screening-answer",
    });
  }

  // Rule 2: a must-have with nothing supporting it is a probe for the interview.
  const evidenced = [...forCol, ...againstCol].map((i) => norm(i.quote));
  for (const mustHave of input.rubricMustHaves) {
    const need = mustHave?.trim();
    if (!need) continue;
    const words = norm(need)
      .split(" ")
      .filter((w) => w.length > 3);
    const covered = evidenced.some((text) => words.some((w) => text.includes(w)));
    if (!covered) {
      verifyCol.push({
        quote: need,
        citation: "Rubric must-have — no evidence found",
        kind: "unevidenced-must-have",
      });
    }
  }

  const counts = { for: forCol.length, verify: verifyCol.length, against: againstCol.length };
  return {
    for: forCol,
    verify: verifyCol,
    against: againstCol,
    counts,
    droppedUnattributed,
    isEmpty: counts.for + counts.verify + counts.against === 0,
  };
}
