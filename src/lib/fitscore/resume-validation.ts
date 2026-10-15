/**
 * Resume text quality validation (5 checks).
 * Used to gate scoring and trigger vision fallback when text extraction is poor.
 */

export type ResumeQuality = "high" | "medium" | "low" | "failed";

export interface QualityResult {
  quality: ResumeQuality;
  score: number; // 0-5 (count of checks passed)
  checks: {
    word_count: boolean;
    work_history: boolean;
    action_verbs: boolean;
    coherence: boolean;
    sections: boolean;
  };
  warnings: string[];
}

const MIN_WORDS = 100;
const MIN_YEAR_MENTIONS = 2;
const MIN_ACTION_VERBS = 5;
const MIN_COHERENCE_RATIO = 0.5;
const MIN_SECTIONS = 2;

const ACTION_VERBS = [
  "led",
  "built",
  "designed",
  "managed",
  "created",
  "developed",
  "implemented",
  "established",
  "maintained",
  "architected",
  "delivered",
  "improved",
  "reduced",
  "increased",
  "launched",
  "collaborated",
  "conducted",
  "spearheaded",
  "transformed",
  "optimized",
  "drove",
  "contributed",
  "supported",
  "coordinated",
  "facilitated",
  "mentored",
  "researched",
  "analyzed",
  "streamlined",
  "scaled",
  "owned",
];

const SECTION_KEYWORDS = [
  "experience",
  "work experience",
  "employment",
  "education",
  "qualification",
  "degree",
  "skills",
  "tools",
  "technologies",
  "competencies",
];

/**
 * Run 5 quality checks on extracted resume text.
 * Used to detect failed or partial extractions (e.g. only skills/metadata, no work experience).
 */
export function validateResumeText(text: string): QualityResult {
  const trimmed = (text ?? "").trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const warnings: string[] = [];

  // Check 1: Word count
  const wordCountOk = words.length >= MIN_WORDS;
  if (!wordCountOk) {
    warnings.push(`Only ${words.length} words extracted (minimum ${MIN_WORDS} expected)`);
  }

  // Check 2: Work history date signals
  const dateMatches = trimmed.match(/\b20\d{2}\b/g) ?? [];
  const workHistoryOk = dateMatches.length >= MIN_YEAR_MENTIONS;
  if (!workHistoryOk) {
    warnings.push(
      `Only ${dateMatches.length} year references found (need ${MIN_YEAR_MENTIONS}+ for work history)`,
    );
  }

  // Check 3: Action verbs
  const textLower = trimmed.toLowerCase();
  const verbCount = ACTION_VERBS.filter((v) => textLower.includes(v)).length;
  const actionVerbsOk = verbCount >= MIN_ACTION_VERBS;
  if (!actionVerbsOk) {
    warnings.push(
      `Only ${verbCount} action verbs found (need ${MIN_ACTION_VERBS}+ for work descriptions)`,
    );
  }

  // Check 4: Coherence (ratio of recognizable words)
  const validWords = words.filter((w) => w.length > 2 && /^[a-zA-Z]+$/.test(w));
  const coherenceRatio = words.length > 0 ? validWords.length / words.length : 0;
  const coherenceOk = coherenceRatio >= MIN_COHERENCE_RATIO;
  if (!coherenceOk) {
    warnings.push(`Coherence ratio ${(coherenceRatio * 100).toFixed(0)}% (need 50%+)`);
  }

  // Check 5: Section detection
  const sectionsFound = SECTION_KEYWORDS.filter((s) => textLower.includes(s)).length;
  const sectionsOk = sectionsFound >= MIN_SECTIONS;
  if (!sectionsOk) {
    warnings.push(`Only ${sectionsFound} section headers found (need ${MIN_SECTIONS}+)`);
  }

  const checks = {
    word_count: wordCountOk,
    work_history: workHistoryOk,
    action_verbs: actionVerbsOk,
    coherence: coherenceOk,
    sections: sectionsOk,
  };

  const score = Object.values(checks).filter(Boolean).length;
  let quality: ResumeQuality;
  if (score >= 4) quality = "high";
  else if (score >= 3) quality = "medium";
  else if (score >= 2) quality = "low";
  else quality = "failed";

  return { quality, score, checks, warnings };
}
